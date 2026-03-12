####################
#  angle_utils.py
#
# Joint Angle Estimation from MediaPipe Holistic Landmarks
# Computes 3D angles for body, hand, and trunk joints
#
# Author: Michelangelo Guaitolini, 12.03.2026
####################

"""
Joint angle utilities for MediaPipe Holistic wholebody pose.

All angles are computed as the angle at vertex B between rays B→A and B→C,
using the 3D coordinates (x, y, z) provided by MediaPipe.
Result is in degrees [0, 180].
"""

import numpy as np
from typing import Optional


# ── MediaPipe Pose landmark indices (33 pts) ──────────────────────────────────
class PoseLM:
    NOSE            = 0
    LEFT_EYE        = 2
    RIGHT_EYE       = 5
    LEFT_EAR        = 7
    RIGHT_EAR       = 8
    LEFT_SHOULDER   = 11
    RIGHT_SHOULDER  = 12
    LEFT_ELBOW      = 13
    RIGHT_ELBOW     = 14
    LEFT_WRIST      = 15
    RIGHT_WRIST     = 16
    LEFT_PINKY      = 17
    RIGHT_PINKY     = 18
    LEFT_INDEX      = 19
    RIGHT_INDEX     = 20
    LEFT_THUMB      = 21
    RIGHT_THUMB     = 22
    LEFT_HIP        = 23
    RIGHT_HIP       = 24
    LEFT_KNEE       = 25
    RIGHT_KNEE      = 26
    LEFT_ANKLE      = 27
    RIGHT_ANKLE     = 28
    LEFT_HEEL       = 29
    RIGHT_HEEL      = 30
    LEFT_FOOT_INDEX = 31
    RIGHT_FOOT_INDEX= 32


# ── MediaPipe Hand landmark indices (21 pts) ──────────────────────────────────
class HandLM:
    WRIST              = 0
    THUMB_CMC          = 1
    THUMB_MCP          = 2
    THUMB_IP           = 3
    THUMB_TIP          = 4
    INDEX_MCP          = 5
    INDEX_PIP          = 6
    INDEX_DIP          = 7
    INDEX_TIP          = 8
    MIDDLE_MCP         = 9
    MIDDLE_PIP         = 10
    MIDDLE_DIP         = 11
    MIDDLE_TIP         = 12
    RING_MCP           = 13
    RING_PIP           = 14
    RING_DIP           = 15
    RING_TIP           = 16
    PINKY_MCP          = 17
    PINKY_PIP          = 18
    PINKY_DIP          = 19
    PINKY_TIP          = 20


def _pt(landmarks, idx: int) -> np.ndarray:
    """Extract (x, y, z) from a MediaPipe NormalizedLandmark list."""
    lm = landmarks[idx]
    return np.array([lm.x, lm.y, lm.z], dtype=np.float64)


def _pt_hand(landmarks, idx: int) -> np.ndarray:
    """Extract (x, y, z) from a MediaPipe hand NormalizedLandmark list."""
    lm = landmarks[idx]
    return np.array([lm.x, lm.y, lm.z], dtype=np.float64)


def angle_at_vertex(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """
    Compute the angle (degrees) at vertex B, between rays B→A and B→C.
    Uses 3D dot-product formula. Returns 0.0 if any vector has zero length.
    """
    ba = a - b
    bc = c - b
    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba < 1e-6 or norm_bc < 1e-6:
        return 0.0
    cos_a = np.clip(np.dot(ba, bc) / (norm_ba * norm_bc), -1.0, 1.0)
    return float(np.degrees(np.arccos(cos_a)))


def _visibility(landmarks, *indices: int, threshold: float = 0.4) -> bool:
    """Return True if ALL landmark indices have visibility >= threshold."""
    for idx in indices:
        lm = landmarks[idx]
        vis = getattr(lm, 'visibility', 1.0)
        if vis < threshold:
            return False
    return True


def compute_body_angles(pose_landmarks) -> dict:
    """
    Compute biomechanical joint angles from 33 MediaPipe Pose landmarks.

    Returns a dict: joint_name → angle_degrees (float, rounded to 1 decimal).
    Missing/low-confidence joints are omitted.
    """
    if pose_landmarks is None:
        return {}

    lm = pose_landmarks
    angles = {}

    def safe_angle(name, ai, bi, ci):
        if _visibility(lm, ai, bi, ci):
            val = angle_at_vertex(_pt(lm, ai), _pt(lm, bi), _pt(lm, ci))
            angles[name] = round(val, 1)

    # ── Arms ──────────────────────────────────────────────────────────────────
    # Shoulder flexion/extension: hip – shoulder – elbow
    safe_angle('left_shoulder',  PoseLM.LEFT_HIP,    PoseLM.LEFT_SHOULDER,  PoseLM.LEFT_ELBOW)
    safe_angle('right_shoulder', PoseLM.RIGHT_HIP,   PoseLM.RIGHT_SHOULDER, PoseLM.RIGHT_ELBOW)

    # Elbow flexion: shoulder – elbow – wrist
    safe_angle('left_elbow',  PoseLM.LEFT_SHOULDER,  PoseLM.LEFT_ELBOW,  PoseLM.LEFT_WRIST)
    safe_angle('right_elbow', PoseLM.RIGHT_SHOULDER, PoseLM.RIGHT_ELBOW, PoseLM.RIGHT_WRIST)

    # Wrist deviation: elbow – wrist – index_finger_knuckle
    safe_angle('left_wrist',  PoseLM.LEFT_ELBOW,  PoseLM.LEFT_WRIST,  PoseLM.LEFT_INDEX)
    safe_angle('right_wrist', PoseLM.RIGHT_ELBOW, PoseLM.RIGHT_WRIST, PoseLM.RIGHT_INDEX)

    # ── Legs ──────────────────────────────────────────────────────────────────
    # Hip flexion: shoulder – hip – knee
    safe_angle('left_hip',  PoseLM.LEFT_SHOULDER,  PoseLM.LEFT_HIP,  PoseLM.LEFT_KNEE)
    safe_angle('right_hip', PoseLM.RIGHT_SHOULDER, PoseLM.RIGHT_HIP, PoseLM.RIGHT_KNEE)

    # Knee flexion: hip – knee – ankle
    safe_angle('left_knee',  PoseLM.LEFT_HIP,  PoseLM.LEFT_KNEE,  PoseLM.LEFT_ANKLE)
    safe_angle('right_knee', PoseLM.RIGHT_HIP, PoseLM.RIGHT_KNEE, PoseLM.RIGHT_ANKLE)

    # Ankle dorsiflexion: knee – ankle – foot_index
    safe_angle('left_ankle',  PoseLM.LEFT_KNEE,  PoseLM.LEFT_ANKLE,  PoseLM.LEFT_FOOT_INDEX)
    safe_angle('right_ankle', PoseLM.RIGHT_KNEE, PoseLM.RIGHT_ANKLE, PoseLM.RIGHT_FOOT_INDEX)

    # ── Trunk ─────────────────────────────────────────────────────────────────
    # Trunk lean: angle between spine vector and vertical (Y-axis)
    if _visibility(lm, PoseLM.LEFT_SHOULDER, PoseLM.RIGHT_SHOULDER,
                       PoseLM.LEFT_HIP, PoseLM.RIGHT_HIP):
        mid_sh  = (_pt(lm, PoseLM.LEFT_SHOULDER)  + _pt(lm, PoseLM.RIGHT_SHOULDER))  / 2
        mid_hip = (_pt(lm, PoseLM.LEFT_HIP)        + _pt(lm, PoseLM.RIGHT_HIP))        / 2
        spine   = mid_sh - mid_hip
        vertical = np.array([0.0, -1.0, 0.0])  # -Y because image Y goes downward
        norm = np.linalg.norm(spine)
        if norm > 1e-6:
            cos_a = np.clip(np.dot(spine, vertical) / norm, -1.0, 1.0)
            angles['trunk_lean'] = round(float(np.degrees(np.arccos(cos_a))), 1)

    # Shoulder width / lateral tilt: angle of shoulder line vs horizontal
    if _visibility(lm, PoseLM.LEFT_SHOULDER, PoseLM.RIGHT_SHOULDER):
        diff = _pt(lm, PoseLM.RIGHT_SHOULDER) - _pt(lm, PoseLM.LEFT_SHOULDER)
        horizontal = np.array([1.0, 0.0, 0.0])
        norm = np.linalg.norm(diff)
        if norm > 1e-6:
            cos_a = np.clip(np.dot(diff, horizontal) / norm, -1.0, 1.0)
            angles['shoulder_tilt'] = round(float(np.degrees(np.arccos(cos_a))), 1)

    return angles


def _finger_angles(hand_lm, side: str,
                   mcp_idx, pip_idx, dip_idx, finger: str) -> dict:
    """Compute MCP and PIP angles for a single finger."""
    out = {}
    # MCP: wrist – MCP – PIP
    a = angle_at_vertex(
        _pt_hand(hand_lm, HandLM.WRIST),
        _pt_hand(hand_lm, mcp_idx),
        _pt_hand(hand_lm, pip_idx)
    )
    out[f'{side}_{finger}_mcp'] = round(a, 1)
    # PIP: MCP – PIP – DIP
    b = angle_at_vertex(
        _pt_hand(hand_lm, mcp_idx),
        _pt_hand(hand_lm, pip_idx),
        _pt_hand(hand_lm, dip_idx)
    )
    out[f'{side}_{finger}_pip'] = round(b, 1)
    return out


def compute_hand_angles(hand_landmarks, side: str) -> dict:
    """
    Compute MCP + PIP flexion angles for all 5 fingers.

    side: 'left' or 'right'
    Returns dict: joint_name → angle_degrees
    """
    if hand_landmarks is None:
        return {}

    lm = hand_landmarks
    angles = {}

    fingers = [
        ('thumb',  HandLM.THUMB_CMC,   HandLM.THUMB_MCP,   HandLM.THUMB_IP),
        ('index',  HandLM.INDEX_MCP,   HandLM.INDEX_PIP,   HandLM.INDEX_DIP),
        ('middle', HandLM.MIDDLE_MCP,  HandLM.MIDDLE_PIP,  HandLM.MIDDLE_DIP),
        ('ring',   HandLM.RING_MCP,    HandLM.RING_PIP,    HandLM.RING_DIP),
        ('pinky',  HandLM.PINKY_MCP,   HandLM.PINKY_PIP,   HandLM.PINKY_DIP),
    ]

    for finger, mcp, pip, dip in fingers:
        angles.update(_finger_angles(lm, side, mcp, pip, dip, finger))

    return angles


def compute_all_angles(pose_landmarks,
                       left_hand_landmarks=None,
                       right_hand_landmarks=None) -> dict:
    """
    Master function: compute all joint angles from MediaPipe Holistic results.

    Returns a flat dict: joint_name → angle_degrees.
    """
    angles = {}
    angles.update(compute_body_angles(pose_landmarks))
    angles.update(compute_hand_angles(left_hand_landmarks,  'left'))
    angles.update(compute_hand_angles(right_hand_landmarks, 'right'))
    return angles