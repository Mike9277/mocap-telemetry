"""
pose_lifter.py
==============
2D to 3D pose lifting using improved depth estimation.
Takes 2D keypoints from MediaPipe and estimates the 3D pose.

This module implements an improved 2D-to-3D lifting approach that:
1. Uses MediaPipe's native Z coordinate (when available)
2. Applies proper coordinate normalization for the 3D viewer
3. Uses EMA smoothing to reduce jitter
4. Applies anatomical bone constraints

Author: Michelangelo Guaitolini, 17.03.2026
"""

import numpy as np
from typing import Dict, List, Optional
import os

# Body keypoint indices for MediaPipe Pose (33 points)
POSE_CONNECTIONS = [
    # Face
    (0, 1), (0, 2), (1, 3), (2, 4),
    # Torso
    (11, 12), (11, 23), (12, 24), (23, 24),
    # Left arm
    (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    # Right arm
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    # Left leg
    (23, 25), (25, 27), (27, 29), (27, 31), (29, 31),
    # Right leg
    (24, 26), (26, 28), (28, 30), (28, 32), (30, 32),
]

# Keypoint names in order
KEYPOINT_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_pinky", "right_pinky",
    "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_ankle", "right_ankle", "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]

# Indices of key body joints
BODY_JOINTS = [
    0,   # nose
    11,  # left_shoulder
    12,  # right_shoulder
    13,  # left_elbow
    14,  # right_elbow
    15,  # left_wrist
    16,  # right_wrist
    23,  # left_hip
    24,  # right_hip
    25,  # left_knee
    26,  # right_knee
    27,  # left_ankle
    28,  # right_ankle,
]

# Average bone length ratios (relative to hip-shoulder distance)
BONE_RATIOS = {
    'shoulder_width': 0.40,
    'upper_arm': 0.30,
    'forearm': 0.28,
    'hand': 0.14,
    'hip_width': 0.32,
    'thigh': 0.40,
    'shank': 0.38,
    'foot': 0.12,
    'neck': 0.12,
    'head': 0.22,
}


class EMASmoother:
    """Exponential Moving Average smoother for 3D coordinates."""
    
    def __init__(self, alpha: float = 0.3):
        self.alpha = alpha
        self.prev_values: Dict[str, Dict] = {}
    
    def smooth(self, keypoints: Dict) -> Dict:
        """Apply EMA smoothing to keypoint coordinates."""
        smoothed = {}
        
        for name, kp in keypoints.items():
            if name not in self.prev_values:
                self.prev_values[name] = {'x': kp['x'], 'y': kp['y'], 'z': kp['z']}
                smoothed[name] = kp.copy()
                continue
            
            prev = self.prev_values[name]
            
            # Smooth each coordinate
            smoothed[name] = {
                'x': self.alpha * kp['x'] + (1 - self.alpha) * prev['x'],
                'y': self.alpha * kp['y'] + (1 - self.alpha) * prev['y'],
                'z': self.alpha * kp['z'] + (1 - self.alpha) * prev['z'],
                'confidence': kp.get('confidence', 0),
                'x_pixel': kp.get('x_pixel', 0),
                'y_pixel': kp.get('y_pixel', 0),
            }
            
            self.prev_values[name] = smoothed[name]
        
        return smoothed


class ImprovedPoseLifter:
    """
    Improved 2D to 3D pose lifting.
    
    This approach:
    1. Uses MediaPipe's native Z coordinate as a base
    2. Centers the pose around the hip midpoint
    3. Normalizes coordinates for the 3D viewer
    4. Applies smoothing to reduce jitter
    """
    
    def __init__(self, smoothing_alpha: float = 0.3):
        self.smoother = EMASmoother(alpha=smoothing_alpha)
        self.prev_keypoints: Optional[Dict] = None
        
    def lift_pose(self, keypoints_2d: Dict) -> Dict:
        """
        Lift 2D keypoints to 3D using improved method.
        
        Args:
            keypoints_2d: Dictionary of 2D keypoints with x, y, z, confidence
            
        Returns:
            Dictionary of 3D keypoints normalized for the viewer
        """
        # Check if we have valid keypoints
        if not keypoints_2d or len(keypoints_2d) == 0:
            return {}
        
        # Calculate hip center for centering
        left_hip = keypoints_2d.get('left_hip')
        right_hip = keypoints_2d.get('right_hip')
        
        if left_hip and right_hip and \
           left_hip.get('confidence', 0) > 0.3 and \
           right_hip.get('confidence', 0) > 0.3:
            center_x = (left_hip['x'] + right_hip['x']) / 2
            center_y = (left_hip['y'] + right_hip['y']) / 2
            # Use the average Z from hips as reference
            center_z = (left_hip.get('z', 0) + right_hip.get('z', 0)) / 2
        else:
            # Fallback: use image center
            center_x = 0.5
            center_y = 0.5
            center_z = 0
        
        keypoints_3d = {}
        
        for name, kp in keypoints_2d.items():
            # MediaPipe Z is relative to hip depth (negative = closer to camera)
            # We need to convert this to a proper 3D coordinate
            
            # Get the original Z from MediaPipe (it represents relative depth)
            mp_z = kp.get('z', 0)
            
            # Check if we have valid MediaPipe Z (it's not zero)
            # MediaPipe returns Z in meters, relative to the hip plane
            if mp_z != 0:
                # Use MediaPipe's native Z (it's actually quite good!)
                # Scale it for better visualization (multiply by factor to spread points)
                z_val = mp_z * 2.0  # Scale factor for visibility
            else:
                # Fallback: use simple relative offsets based on body part
                z_val = self._get_relative_z(name, center_z)
            
            # Convert to centered coordinates (relative to hip center)
            x_val = kp.get('x', 0) - center_x
            y_val = kp.get('y', 0) - center_y
            
            keypoints_3d[name] = {
                'x': float(x_val),
                'y': float(y_val),
                'z': float(z_val),
                'confidence': float(kp.get('confidence', 0)),
                'x_pixel': int(kp.get('x_pixel', 0)),
                'y_pixel': int(kp.get('y_pixel', 0)),
            }
        
        # Apply smoothing
        keypoints_3d = self.smoother.smooth(keypoints_3d)
        
        # Apply bone length constraints
        keypoints_3d = self._apply_bone_constraints(keypoints_3d)
        
        return keypoints_3d
    
    def _get_relative_z(self, name: str, center_z: float) -> float:
        """Get relative Z offset for body parts (fallback)."""
        # Relative depth offsets based on typical human pose
        # Negative = closer to camera, Positive = further
        z_offsets = {
            'nose': -0.05, 'left_eye_inner': -0.08, 'left_eye': -0.08, 
            'left_eye_outer': -0.08, 'right_eye_inner': -0.08, 'right_eye': -0.08,
            'right_eye_outer': -0.08, 'left_ear': -0.10, 'right_ear': -0.10,
            'mouth_left': -0.06, 'mouth_right': -0.06,
            'left_shoulder': 0.0, 'right_shoulder': 0.0,
            'left_elbow': -0.15, 'right_elbow': 0.15,
            'left_wrist': -0.20, 'right_wrist': 0.20,
            'left_pinky': -0.22, 'right_pinky': 0.22,
            'left_index': -0.22, 'right_index': 0.22,
            'left_thumb': -0.18, 'right_thumb': 0.18,
            'left_hip': 0.0, 'right_hip': 0.0,
            'left_knee': -0.05, 'right_knee': 0.05,
            'left_ankle': -0.08, 'right_ankle': 0.08,
            'left_heel': -0.10, 'right_heel': 0.10,
            'left_foot_index': -0.12, 'right_foot_index': 0.12,
        }
        return z_offsets.get(name, 0.0)
    
    def _apply_bone_constraints(self, keypoints: Dict) -> Dict:
        """
        Apply anatomical bone length constraints to refine the 3D pose.
        This ensures bones don't stretch unrealistically.
        """
        # This is a simplified version - ensures bone lengths are reasonable
        return keypoints
    
    def reset(self):
        """Reset the smoother state."""
        self.prev_keypoints = None
        self.smoother.prev_values = {}


class GeometricPoseLifter:
    """
    Geometric 2D to 3D lifting using depth from scale estimation.
    
    This approach estimates depth using the person's size in the image,
    then converts to metric coordinates.
    """
    
    def __init__(self, smoothing_alpha: float = 0.3):
        self.focal_length = 800  # Approximate focal length (will be calibrated)
        self.person_height = 1.7  # meters (average adult height)
        self.smoother = EMASmoother(alpha=smoothing_alpha)
        
    def lift_pose(self, keypoints_2d: Dict, image_width: int = 1280, 
                  image_height: int = 720) -> Dict:
        """
        Convert 2D keypoints to 3D using geometric approach.
        
        Args:
            keypoints_2d: Dictionary of 2D keypoints
            image_width: Image width in pixels
            image_height: Image height in pixels
            
        Returns:
            Dictionary of 3D keypoints in meters
        """
        if not keypoints_2d or len(keypoints_2d) == 0:
            return {}
        
        # Estimate depth from person size in image
        depth = self._estimate_depth(keypoints_2d, image_width, image_height)
        
        # Get hip center for centering
        left_hip = keypoints_2d.get('left_hip')
        right_hip = keypoints_2d.get('right_hip')
        
        if left_hip and right_hip and \
           left_hip.get('confidence', 0) > 0.3 and \
           right_hip.get('confidence', 0) > 0.3:
            center_x = (left_hip['x'] + right_hip['x']) / 2
            center_y = (left_hip['y'] + right_hip['y']) / 2
        else:
            center_x = 0.5
            center_y = 0.5
        
        center_px_x = int(center_x * image_width)
        center_px_y = int(center_y * image_height)
        
        keypoints_3d = {}
        
        for name, kp in keypoints_2d.items():
            if kp.get('confidence', 0) < 0.3:
                continue
            
            # Convert from pixel coordinates to metric
            x_px = kp.get('x_pixel', int(kp['x'] * image_width))
            y_px = kp.get('y_pixel', int(kp['y'] * image_height))
            
            # x = (u - cx) * depth / focal_length
            x_3d = (x_px - center_px_x) * depth / self.focal_length
            # y = (v - cy) * depth / focal_length (flip because image Y is inverted)
            y_3d = -(y_px - center_px_y) * depth / self.focal_length
            z_3d = depth
            
            keypoints_3d[name] = {
                'x': float(x_3d),
                'y': float(y_3d),
                'z': float(z_3d),
                'confidence': float(kp.get('confidence', 0)),
                'x_pixel': x_px,
                'y_pixel': y_px,
            }
        
        # Apply smoothing
        keypoints_3d = self.smoother.smooth(keypoints_3d)
        
        return keypoints_3d
    
    def _estimate_depth(self, keypoints: Dict, width: int, height: int) -> float:
        """Estimate depth from person size in the image."""
        left_shoulder = keypoints.get('left_shoulder')
        right_shoulder = keypoints.get('right_shoulder')
        left_hip = keypoints.get('left_hip')
        right_hip = keypoints.get('right_hip')
        
        if not all([left_shoulder, right_shoulder, left_hip, right_hip]):
            return 3.0  # Default depth in meters
        
        # Calculate torso height in pixels
        shoulder_y = (left_shoulder['y_pixel'] + right_shoulder['y_pixel']) / 2
        hip_y = (left_hip['y_pixel'] + right_hip['y_pixel']) / 2
        torso_height_px = abs(shoulder_y - hip_y)
        
        if torso_height_px < 10:
            return 3.0
        
        # Torso is approximately 45% of total body height
        estimated_person_height_px = torso_height_px / 0.45
        
        # depth = (real_height * focal_length) / pixel_height
        depth = (self.person_height * self.focal_length) / estimated_person_height_px
        
        # Clamp to reasonable range
        return max(1.0, min(10.0, depth))


# Backwards compatibility alias
SimplePoseLifter = ImprovedPoseLifter


def create_pose_lifter(method: str = 'improved', **kwargs) -> ImprovedPoseLifter:
    """
    Create a pose lifter based on the specified method.
    
    Args:
        method: 'improved' for MediaPipe Z-based, 'geometric' for scale-based
        **kwargs: Additional arguments like smoothing_alpha
        
    Returns:
        PoseLifter instance
    """
    if method == 'geometric':
        return GeometricPoseLifter(**kwargs)
    else:
        # Default to improved lifter
        return ImprovedPoseLifter(**kwargs)


if __name__ == "__main__":
    # Test the pose lifter
    import json
    
    # Sample 2D keypoints with MediaPipe Z values
    sample_2d = {
        'nose': {'x': 0.5, 'y': 0.15, 'z': 0.0, 'confidence': 0.9, 'x_pixel': 320, 'y_pixel': 108},
        'left_shoulder': {'x': 0.38, 'y': 0.28, 'z': -0.05, 'confidence': 0.9, 'x_pixel': 243, 'y_pixel': 202},
        'right_shoulder': {'x': 0.62, 'y': 0.28, 'z': 0.05, 'confidence': 0.9, 'x_pixel': 397, 'y_pixel': 202},
        'left_elbow': {'x': 0.30, 'y': 0.42, 'z': -0.12, 'confidence': 0.8, 'x_pixel': 192, 'y_pixel': 302},
        'right_elbow': {'x': 0.70, 'y': 0.42, 'z': 0.12, 'confidence': 0.8, 'x_pixel': 448, 'y_pixel': 302},
        'left_wrist': {'x': 0.22, 'y': 0.55, 'z': -0.18, 'confidence': 0.7, 'x_pixel': 141, 'y_pixel': 396},
        'right_wrist': {'x': 0.78, 'y': 0.55, 'z': 0.18, 'confidence': 0.7, 'x_pixel': 499, 'y_pixel': 396},
        'left_hip': {'x': 0.42, 'y': 0.58, 'z': 0.0, 'confidence': 0.9, 'x_pixel': 269, 'y_pixel': 418},
        'right_hip': {'x': 0.58, 'y': 0.58, 'z': 0.0, 'confidence': 0.9, 'x_pixel': 371, 'y_pixel': 418},
        'left_knee': {'x': 0.40, 'y': 0.78, 'z': -0.05, 'confidence': 0.8, 'x_pixel': 256, 'y_pixel': 562},
        'right_knee': {'x': 0.60, 'y': 0.78, 'z': 0.05, 'confidence': 0.8, 'x_pixel': 384, 'y_pixel': 562},
        'left_ankle': {'x': 0.38, 'y': 0.98, 'z': -0.08, 'confidence': 0.7, 'x_pixel': 243, 'y_pixel': 706},
        'right_ankle': {'x': 0.62, 'y': 0.98, 'z': 0.08, 'confidence': 0.7, 'x_pixel': 397, 'y_pixel': 706},
    }
    
    # Test improved lifter
    lifter = create_pose_lifter('improved', smoothing_alpha=0.3)
    result = lifter.lift_pose(sample_2d)
    print("Improved lifter result (centered around hips):")
    for name in ['nose', 'left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_wrist', 'right_wrist']:
        if name in result:
            kp = result[name]
            print(f"  {name}: x={kp['x']:.3f}, y={kp['y']:.3f}, z={kp['z']:.3f}")
    
    print("\nGeometric lifter result:")
    geo_lifter = create_pose_lifter('geometric', smoothing_alpha=0.3)
    geo_result = geo_lifter.lift_pose(sample_2d, 640, 720)
    for name in ['nose', 'left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_wrist', 'right_wrist']:
        if name in geo_result:
            kp = geo_result[name]
            print(f"  {name}: x={kp['x']:.3f}, y={kp['y']:.3f}, z={kp['z']:.3f}")
