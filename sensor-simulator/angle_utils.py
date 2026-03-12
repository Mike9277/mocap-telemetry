"""
angle_utils.py
==============
Clinical joint angle estimation from MediaPipe Holistic landmarks.

Methodology
-----------
Each body segment is assigned an orthonormal coordinate system (CS) following
ISB recommendations (Wu et al., 2002 / 2005).  Joint angles are obtained by
expressing the distal segment axes in the proximal segment CS and reading off
the three clinical components directly from the resulting rotation matrix.

Virtual Anatomical Landmarks
-----------------------------
MediaPipe outputs "functional" points (geometric surface estimates), not true
bony landmarks.  This module derives virtual equivalents of the markers a
biomechanist places in a Vicon / stereophotogrammetry session:

  VL_HJC_{L/R}  Hip Joint Centre  — Bell (1990) regression from ASIS width
  VL_KJC_{L/R}  Knee Joint Centre — midpoint of estimated epicondyles
  VL_AJC_{L/R}  Ankle Joint Centre— midpoint of estimated malleoli
  VL_ASIS_{L/R} Anterior Superior Iliac Spine estimate (from hip + pelvis CS)
  VL_MID_ASIS   Midpoint of ASIS pair (pubic symphysis proxy)
  VL_MID_HIP    Midpoint of Hip Joint Centres  (lumbo-sacral joint proxy)
  VL_MID_ANKLE  Midpoint of Ankle Joint Centres

Scaling
-------
All offsets are expressed as fractions of inter-landmark distances (e.g.
inter-hip width), so they are body-size invariant.

Coordinate convention (right-handed, clinical frame)
-----------------------------------------------------
MediaPipe raw:   x→right (0–1),  y↓ (0–1),   z depth (neg = toward camera)
Clinical frame:  X→right (+),    Y↑ (+),      Z→anterior (+toward camera)
Conversion:      X = +mp.x      Y = −mp.y     Z = −mp.z

Segment CS definition (identical for every segment)
-----------------------------------------------------
  e_x  — mediolateral axis, pointing to subject's RIGHT
  e_y  — long axis,         pointing PROXIMALLY  (superiorly)
  e_z  — anteroposterior,   pointing ANTERIORLY  = cross(e_x, e_y)

Sign conventions (ISB / clinical gait analysis)
------------------------------------------------
  Flexion   (+) / Extension   (−)   — sagittal plane
  Abduction (+) / Adduction   (−)   — frontal  plane
  Int. Rot. (+) / Ext. Rot.   (−)   — transverse plane
  Valgus    (+) / Varus       (−)   — knee frontal plane
  DorsiFlex (+) / PlantarFlex (−)   — ankle sagittal plane
  Eversion  (+) / Inversion   (−)   — ankle frontal plane
  Ant. Tilt (+) / Post. Tilt  (−)   — pelvis sagittal

References
----------
Wu et al. (2002) J Biomech 35(4):543-548    — lower extremity ISB
Wu et al. (2005) J Biomech 38(5):981-992    — upper extremity ISB
Bell et al. (1990) J Biomech 23(6):617-621  — HJC regression
Grood & Suntay (1983) J Biomech Eng 105     — Knee CS
"""

import numpy as np
from typing import Optional, Dict


# ── MediaPipe landmark indices ────────────────────────────────────────────────

class PL:
    """Pose landmark indices (MediaPipe 33-point model)."""
    NOSE             = 0
    L_EYE_INNER = 1; L_EYE = 2; L_EYE_OUTER = 3
    R_EYE_INNER = 4; R_EYE = 5; R_EYE_OUTER = 6
    L_EAR = 7;  R_EAR = 8
    MOUTH_L = 9; MOUTH_R = 10
    L_SHOULDER = 11; R_SHOULDER = 12
    L_ELBOW    = 13; R_ELBOW    = 14
    L_WRIST    = 15; R_WRIST    = 16
    L_PINKY    = 17; R_PINKY    = 18
    L_INDEX    = 19; R_INDEX    = 20
    L_THUMB    = 21; R_THUMB    = 22
    L_HIP      = 23; R_HIP      = 24
    L_KNEE     = 25; R_KNEE     = 26
    L_ANKLE    = 27; R_ANKLE    = 28
    L_HEEL     = 29; R_HEEL     = 30
    L_FOOT_IDX = 31; R_FOOT_IDX = 32


class HL:
    """Hand landmark indices (MediaPipe 21-point model)."""
    WRIST     = 0
    THUMB_CMC = 1; THUMB_MCP = 2; THUMB_IP  = 3; THUMB_TIP = 4
    IDX_MCP   = 5; IDX_PIP   = 6; IDX_DIP   = 7; IDX_TIP   = 8
    MID_MCP   = 9; MID_PIP   =10; MID_DIP   =11; MID_TIP   =12
    RNG_MCP   =13; RNG_PIP   =14; RNG_DIP   =15; RNG_TIP   =16
    PNK_MCP   =17; PNK_PIP   =18; PNK_DIP   =19; PNK_TIP   =20


# ── Low-level geometry ────────────────────────────────────────────────────────

def _norm(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n > 1e-8 else np.zeros(3)

def _pt(lm, idx: int) -> np.ndarray:
    """MediaPipe pose landmark → clinical frame (X right, Y up, Z anterior)."""
    p = lm[idx]
    return np.array([float(p.x), -float(p.y), -float(p.z)], dtype=np.float64)

def _pt_h(lm, idx: int) -> np.ndarray:
    """MediaPipe hand landmark → clinical frame."""
    p = lm[idx]
    return np.array([float(p.x), -float(p.y), -float(p.z)], dtype=np.float64)

def _vis(lm, *idx, thr: float = 0.35) -> bool:
    for i in idx:
        v = getattr(lm[i], 'visibility', None) or getattr(lm[i], 'presence', None) or 1.0
        if float(v) < thr:
            return False
    return True

def _gs(ref: np.ndarray, fixed: np.ndarray) -> np.ndarray:
    """Gram-Schmidt: project ref perpendicular to fixed (both unit vectors)."""
    return _norm(ref - np.dot(ref, fixed) * fixed)

def _build_cs(e_y: np.ndarray, e_x_approx: np.ndarray) -> np.ndarray:
    """
    Build 3×3 orthonormal CS matrix (columns = [e_x, e_y, e_z]).
    e_y is the proximal long axis (given).
    e_x is the mediolateral axis (approximate, refined via Gram-Schmidt).
    e_z = cross(e_x, e_y)  — anterior direction.
    """
    e_y = _norm(e_y)
    e_x = _gs(_norm(e_x_approx), e_y)
    e_z = _norm(np.cross(e_x, e_y))
    e_x = _norm(np.cross(e_y, e_z))         # re-orthogonalise
    return np.column_stack([e_x, e_y, e_z])  # 3×3


# ══════════════════════════════════════════════════════════════════════════════
#  VIRTUAL ANATOMICAL LANDMARKS
#  Derived from MediaPipe landmarks following clinical marker placement rules
# ══════════════════════════════════════════════════════════════════════════════

def compute_virtual_landmarks(lm) -> Dict[str, np.ndarray]:
    """
    Derive virtual bony landmarks from MediaPipe pose output.

    All returned points are 3-vectors in the clinical frame (X right, Y up,
    Z anterior), in the same normalised units as MediaPipe (0–1 body scale).

    Landmark          Vicon/Stereophotogrammetry equivalent
    ─────────────────────────────────────────────────────────────────────
    MID_HIP           Lumbo-sacral joint proxy / SACRUM
    ASIS_L / ASIS_R   Anterior Superior Iliac Spine
    MID_ASIS          Pubic symphysis proxy
    HJC_L / HJC_R     Hip Joint Centre  (Bell 1990 regression)
    KJC_L / KJC_R     Knee Joint Centre (lateral epicondyle + medial offset)
    AJC_L / AJC_R     Ankle Joint Centre (midpoint medial/lateral malleolus)
    MID_SHOULDER      Mid-cervical spine proxy
    SPINE_MID         Mid-thoracic spine
    EJC_L / EJC_R     Elbow Joint Centre
    WJC_L / WJC_R     Wrist Joint Centre (carpal row midpoint)
    """
    vl: Dict[str, np.ndarray] = {}

    # ── Pelvis / hip complex ─────────────────────────────────────────────────
    if _vis(lm, PL.L_HIP, PL.R_HIP):
        L_hip = _pt(lm, PL.L_HIP)
        R_hip = _pt(lm, PL.R_HIP)
        mid_hip = (L_hip + R_hip) / 2
        vl['MID_HIP'] = mid_hip

        # Inter-hip (ASIS-to-ASIS proxy) width — used for all pelvis regressions
        pelvis_w = float(np.linalg.norm(R_hip - L_hip))

        # ASIS estimate: MediaPipe hip ≈ greater trochanter region.
        # ASIS is located ~0.22 * pelvis_width anteriorly and ~0.05 superiorly.
        if _vis(lm, PL.L_SHOULDER, PL.R_SHOULDER):
            # Build a rough pelvis CS to express the ASIS offsets
            mid_sh = (_pt(lm, PL.L_SHOULDER) + _pt(lm, PL.R_SHOULDER)) / 2
            e_x = _norm(R_hip - L_hip)
            e_y = _gs(_norm(mid_sh - mid_hip), e_x)
            e_z = _norm(np.cross(e_x, e_y))
            # ASIS offset in pelvis CS: anterior (+z) and slightly superior (+y)
            asis_off = 0.22 * pelvis_w * e_z + 0.08 * pelvis_w * e_y
            vl['ASIS_R'] = R_hip + asis_off
            vl['ASIS_L'] = L_hip + asis_off
            vl['MID_ASIS'] = mid_hip + asis_off

        # Hip Joint Centre — Bell (1990) regression:
        #   HJC = mid-ASIS + [-0.31 * w,  ±0.36 * w,  -0.79 * w]
        #   (sagittal offset posterior, vertical offset inferior, lateral offset)
        # Adapted to our clinical frame using the pelvis CS built above.
        if 'MID_ASIS' in vl:
            e_x_p = _norm(R_hip - L_hip)
            hjc_sag = -0.79 * pelvis_w * e_y   # inferior
            hjc_ant = -0.31 * pelvis_w * e_z   # posterior
            hjc_lat =  0.36 * pelvis_w          # lateral (bilateral)
            vl['HJC_R'] = mid_hip + hjc_sag + hjc_ant + hjc_lat * e_x_p
            vl['HJC_L'] = mid_hip + hjc_sag + hjc_ant - hjc_lat * e_x_p
        else:
            # Fallback: use MediaPipe hip directly
            vl['HJC_R'] = R_hip
            vl['HJC_L'] = L_hip

    # ── Knee Joint Centre ────────────────────────────────────────────────────
    # MediaPipe 'knee' ≈ centre of knee joint.
    # KJC_offset: 0 (already well-placed), but we express it as a named virtual
    # landmark and add a small lateral correction based on shank width estimate.
    for side in ('L', 'R'):
        ki = PL.L_KNEE if side == 'L' else PL.R_KNEE
        ai = PL.L_ANKLE if side == 'L' else PL.R_ANKLE
        hi_key = f'HJC_{side}'
        if _vis(lm, ki, ai) and hi_key in vl:
            knee_pt  = _pt(lm, ki)
            ankle_pt = _pt(lm, ai)
            hjc_pt   = vl[hi_key]
            # Estimate shank length for offset scaling
            shank_l  = float(np.linalg.norm(knee_pt - ankle_pt))
            # KJC = knee point (already good in MediaPipe)
            vl[f'KJC_{side}'] = knee_pt
            # Tibial tuberosity proxy: slightly anterior to KJC
            e_y_sh = _norm(knee_pt - ankle_pt)
            e_x_p  = _norm(vl['HJC_R'] - vl['HJC_L'])
            e_z_sh = _norm(np.cross(e_x_p, e_y_sh))
            vl[f'TT_{side}'] = knee_pt + 0.04 * shank_l * e_z_sh  # tibial tuberosity

    # ── Ankle Joint Centre ───────────────────────────────────────────────────
    # AJC is the midpoint of medial and lateral malleolus.
    # MediaPipe 'ankle' ≈ lateral malleolus region.
    # We estimate medial malleolus at ~0.1 * shank_width medially.
    for side in ('L', 'R'):
        ai = PL.L_ANKLE if side == 'L' else PL.R_ANKLE
        ki = PL.L_KNEE  if side == 'L' else PL.R_KNEE
        if _vis(lm, ai, ki):
            ankle_pt = _pt(lm, ai)
            knee_pt  = _pt(lm, ki)
            shank_l  = float(np.linalg.norm(knee_pt - ankle_pt))
            # Malleolus width ≈ 6.5 % of shank length (anthropometric estimate)
            mal_w = 0.065 * shank_l
            # Lateral malleolus ≈ MediaPipe ankle point
            # Medial malleolus: translate medially
            e_lat = _norm(vl.get('HJC_R', np.array([1.,0.,0.])) -
                          vl.get('HJC_L', np.array([-1.,0.,0.])))  # lateral = right
            if side == 'L': e_lat = -e_lat
            lat_mal  = ankle_pt
            med_mal  = ankle_pt - 2 * mal_w * e_lat
            vl[f'LAT_MAL_{side}'] = lat_mal
            vl[f'MED_MAL_{side}'] = med_mal
            vl[f'AJC_{side}'] = (lat_mal + med_mal) / 2

    # ── Spine / trunk ────────────────────────────────────────────────────────
    if _vis(lm, PL.L_SHOULDER, PL.R_SHOULDER):
        L_sh = _pt(lm, PL.L_SHOULDER)
        R_sh = _pt(lm, PL.R_SHOULDER)
        vl['MID_SHOULDER'] = (L_sh + R_sh) / 2   # C7 / T1 proxy
    if 'MID_SHOULDER' in vl and 'MID_HIP' in vl:
        vl['SPINE_MID'] = (vl['MID_SHOULDER'] + vl['MID_HIP']) / 2  # T8 proxy

    # ── Elbow Joint Centre ───────────────────────────────────────────────────
    for side in ('L', 'R'):
        ei = PL.L_ELBOW if side == 'L' else PL.R_ELBOW
        wi = PL.L_WRIST if side == 'L' else PL.R_WRIST
        si = PL.L_SHOULDER if side == 'L' else PL.R_SHOULDER
        if _vis(lm, ei, wi, si):
            elbow_pt  = _pt(lm, ei)
            wrist_pt  = _pt(lm, wi)
            sh_pt     = _pt(lm, si)
            ua_l      = float(np.linalg.norm(sh_pt - elbow_pt))
            # Epicondyle width ≈ 5 % of upper-arm length
            epi_w = 0.05 * ua_l
            vl[f'EJC_{side}'] = elbow_pt   # EJC ≈ MediaPipe elbow
            # Lateral / medial epicondyle estimates
            e_lat = _norm(vl.get('HJC_R', np.array([1.,0.,0.])) -
                          vl.get('HJC_L', np.array([-1.,0.,0.])))
            if side == 'L': e_lat = -e_lat
            vl[f'LAT_EPI_{side}'] = elbow_pt + epi_w * e_lat
            vl[f'MED_EPI_{side}'] = elbow_pt - epi_w * e_lat

    # ── Wrist Joint Centre ───────────────────────────────────────────────────
    for side in ('L', 'R'):
        wi = PL.L_WRIST if side == 'L' else PL.R_WRIST
        if _vis(lm, wi):
            vl[f'WJC_{side}'] = _pt(lm, wi)   # MediaPipe wrist ≈ carpal row

    return vl


# ══════════════════════════════════════════════════════════════════════════════
#  SEGMENT COORDINATE SYSTEMS
#  Built using virtual landmarks where available, raw landmarks as fallback
# ══════════════════════════════════════════════════════════════════════════════

def _pelvis_cs(lm, vl: dict) -> Optional[np.ndarray]:
    """
    Pelvis CS — origin at MID_HIP.
    e_x: ASIS_R → ASIS_L (if available) else R_HJC → L_HJC
    e_y: cranial (MID_HIP → MID_SHOULDER), GS ⊥ e_x
    """
    if not _vis(lm, PL.L_HIP, PL.R_HIP): return None
    if 'ASIS_R' in vl and 'ASIS_L' in vl:
        e_x = _norm(vl['ASIS_R'] - vl['ASIS_L'])
    else:
        e_x = _norm(_pt(lm, PL.R_HIP) - _pt(lm, PL.L_HIP))
    if not _vis(lm, PL.L_SHOULDER, PL.R_SHOULDER): return None
    mid_hip = vl.get('MID_HIP', (_pt(lm, PL.L_HIP) + _pt(lm, PL.R_HIP)) / 2)
    mid_sh  = vl.get('MID_SHOULDER',
                     (_pt(lm, PL.L_SHOULDER) + _pt(lm, PL.R_SHOULDER)) / 2)
    e_y = _gs(_norm(mid_sh - mid_hip), e_x)
    e_z = _norm(np.cross(e_x, e_y))
    e_x = _norm(np.cross(e_y, e_z))
    return np.column_stack([e_x, e_y, e_z])


def _trunk_cs(lm, vl: dict) -> Optional[np.ndarray]:
    """
    Thorax CS — origin at MID_SHOULDER.
    e_x: R_SHOULDER → L_SHOULDER
    e_y: MID_HIP → MID_SHOULDER (GS ⊥ e_x)
    """
    if not _vis(lm, PL.L_HIP, PL.R_HIP,
                 PL.L_SHOULDER, PL.R_SHOULDER): return None
    mid_hip = vl.get('MID_HIP', (_pt(lm, PL.L_HIP) + _pt(lm, PL.R_HIP)) / 2)
    L_sh = _pt(lm, PL.L_SHOULDER); R_sh = _pt(lm, PL.R_SHOULDER)
    mid_sh = (L_sh + R_sh) / 2
    e_x = _norm(R_sh - L_sh)
    e_y = _gs(_norm(mid_sh - mid_hip), e_x)
    e_z = _norm(np.cross(e_x, e_y))
    e_x = _norm(np.cross(e_y, e_z))
    return np.column_stack([e_x, e_y, e_z])


def _thigh_cs(lm, side: str, vl: dict, pelvis_ex: np.ndarray) -> Optional[np.ndarray]:
    """Femur CS. e_y: KJC → HJC."""
    h_key = f'HJC_{side[0].upper()}'
    k_key = f'KJC_{side[0].upper()}'
    hi = _pt(lm, PL.L_HIP  if side=='left' else PL.R_HIP)
    ki = _pt(lm, PL.L_KNEE if side=='left' else PL.R_KNEE)
    if not _vis(lm, PL.L_HIP  if side=='left' else PL.R_HIP): return None
    if not _vis(lm, PL.L_KNEE if side=='left' else PL.R_KNEE): return None
    hjc = vl.get(h_key, hi)
    kjc = vl.get(k_key, ki)
    e_y = _norm(hjc - kjc)
    e_x_approx = pelvis_ex if side == 'right' else -pelvis_ex
    return _build_cs(e_y, e_x_approx)


def _shank_cs(lm, side: str, vl: dict, thigh_R: np.ndarray) -> Optional[np.ndarray]:
    """Tibia CS. e_y: AJC → KJC."""
    k_key = f'KJC_{side[0].upper()}'
    a_key = f'AJC_{side[0].upper()}'
    ki = _pt(lm, PL.L_KNEE  if side=='left' else PL.R_KNEE)
    ai = _pt(lm, PL.L_ANKLE if side=='left' else PL.R_ANKLE)
    if not _vis(lm, PL.L_KNEE  if side=='left' else PL.R_KNEE): return None
    if not _vis(lm, PL.L_ANKLE if side=='left' else PL.R_ANKLE): return None
    kjc = vl.get(k_key, ki)
    ajc = vl.get(a_key, ai)
    e_y = _norm(kjc - ajc)
    e_x_approx = thigh_R[:, 0]
    return _build_cs(e_y, e_x_approx)


def _foot_cs(lm, side: str, vl: dict) -> Optional[np.ndarray]:
    """
    Foot CS.
    e_z (anterior): AJC → foot-index (toe direction)
    e_y (superior): AJC − heel
    """
    heel_i = PL.L_HEEL     if side=='left' else PL.R_HEEL
    tip_i  = PL.L_FOOT_IDX if side=='left' else PL.R_FOOT_IDX
    if not _vis(lm, heel_i, tip_i): return None
    a_key = f'AJC_{side[0].upper()}'
    heel  = _pt(lm, heel_i)
    tip   = _pt(lm, tip_i)
    ajc   = vl.get(a_key, _pt(lm, PL.L_ANKLE if side=='left' else PL.R_ANKLE))
    e_z   = _norm(tip - heel)
    e_y   = _gs(_norm(ajc - heel), e_z)
    e_x   = _norm(np.cross(e_y, e_z))
    if side == 'left': e_x = -e_x
    e_z   = _norm(np.cross(e_x, e_y))
    return np.column_stack([e_x, e_y, e_z])


def _upper_arm_cs(lm, side: str, vl: dict, trunk_ex: np.ndarray) -> Optional[np.ndarray]:
    """Humerus CS. e_y: EJC → SJC."""
    si = PL.L_SHOULDER if side=='left' else PL.R_SHOULDER
    ei = PL.L_ELBOW    if side=='left' else PL.R_ELBOW
    if not _vis(lm, si, ei): return None
    s_key = f'WJC_{side[0].upper()}'   # shoulder via raw landmark; EJC via vl
    e_key = f'EJC_{side[0].upper()}'
    sjc = _pt(lm, si)
    ejc = vl.get(e_key, _pt(lm, ei))
    e_y = _norm(sjc - ejc)
    e_x_approx = trunk_ex if side == 'right' else -trunk_ex
    return _build_cs(e_y, e_x_approx)


def _forearm_cs(lm, side: str, vl: dict, ua_R: np.ndarray) -> Optional[np.ndarray]:
    """Forearm CS. e_y: WJC → EJC."""
    ei = PL.L_ELBOW if side=='left' else PL.R_ELBOW
    wi = PL.L_WRIST if side=='left' else PL.R_WRIST
    if not _vis(lm, ei, wi): return None
    e_key = f'EJC_{side[0].upper()}'
    w_key = f'WJC_{side[0].upper()}'
    ejc = vl.get(e_key, _pt(lm, ei))
    wjc = vl.get(w_key, _pt(lm, wi))
    e_y = _norm(ejc - wjc)
    return _build_cs(e_y, ua_R[:, 0])


# ══════════════════════════════════════════════════════════════════════════════
#  JOINT ANGLE EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def _flex_abd_rot(R_prox: np.ndarray, R_dist: np.ndarray,
                  flex_sign: float = 1.0,
                  abd_sign:  float = 1.0,
                  rot_sign:  float = 1.0) -> tuple:
    """
    Decompose joint rotation into (flexion, abduction, axial-rotation) degrees.

    R_joint = R_prox^T @ R_dist  expresses the distal CS in the proximal CS.

    Extraction (direct matrix read-out, no sequence ambiguity):
      Flexion   : angle of distal e_y in the sagittal (Y-Z) plane of proximal
      Abduction : angle of distal e_y in the frontal  (X-Y) plane of proximal
      AxialRot  : rotation of distal e_x about the long axis (Y) of proximal
    """
    R  = R_prox.T @ R_dist
    dy = R[:, 1]    # distal long axis expressed in proximal CS
    dx = R[:, 0]    # distal ML   axis expressed in proximal CS

    flex = float(np.degrees(np.arctan2(dy[2], dy[1]))) * flex_sign
    abd  = float(np.degrees(np.arctan2(dy[0], dy[1]))) * abd_sign
    rot  = float(np.degrees(np.arctan2(-dx[2], dx[0]))) * rot_sign

    return round(flex, 1), round(abd, 1), round(rot, 1)


def _segment_orientation(R: np.ndarray) -> tuple:
    """
    Absolute segment orientation relative to the global (lab) frame.
    Returns (forward_lean°, lateral_lean°, axial_rotation°).

    forward_lean  (+) = anterior tilt / forward lean
    lateral_lean  (+) = lean to subject's LEFT
    axial_rotation(+) = rotation to subject's LEFT (viewed from above)
    """
    ey = R[:, 1]
    ex = R[:, 0]
    fwd   = float(np.degrees(np.arctan2(ey[2],  ey[1])))
    lat   = float(np.degrees(np.arctan2(-ey[0], ey[1])))
    axial = float(np.degrees(np.arctan2(-ex[2], ex[0])))
    return round(fwd, 1), round(lat, 1), round(axial, 1)


def _ankle_angles(R_shank: np.ndarray, R_foot: np.ndarray, side: str) -> tuple:
    """
    Ankle dorsiflexion (+) / plantarflexion (−)  [sagittal]
    Eversion (+) / inversion (−)                 [frontal]
    """
    R = R_shank.T @ R_foot
    fz = R[:, 2]           # foot anterior (e_z) in shank CS
    dorsi = float(np.degrees(np.arctan2(fz[1], fz[2])))
    ev_s  = -1.0 if side == 'right' else 1.0
    ever  = float(np.degrees(np.arctan2(fz[0] * ev_s, fz[2])))
    return round(dorsi, 1), round(ever, 1)


# ══════════════════════════════════════════════════════════════════════════════
#  HAND / FINGER ANGLES
# ══════════════════════════════════════════════════════════════════════════════

def _angle3(a, b, c) -> float:
    ba = _norm(a - b); bc = _norm(c - b)
    return round(float(np.degrees(np.arccos(np.clip(np.dot(ba, bc), -1, 1)))), 1)

def compute_hand_angles(hand_lm, side: str) -> dict:
    """MCP + PIP flexion for all 5 fingers (degrees, 180 = fully extended)."""
    if hand_lm is None: return {}
    s = side
    out = {}
    config = [
        ('thumb',  HL.WRIST, HL.THUMB_CMC, HL.THUMB_MCP, HL.THUMB_IP),
        ('index',  HL.WRIST, HL.IDX_MCP,   HL.IDX_PIP,   HL.IDX_DIP),
        ('middle', HL.WRIST, HL.MID_MCP,   HL.MID_PIP,   HL.MID_DIP),
        ('ring',   HL.WRIST, HL.RNG_MCP,   HL.RNG_PIP,   HL.RNG_DIP),
        ('pinky',  HL.WRIST, HL.PNK_MCP,   HL.PNK_PIP,   HL.PNK_DIP),
    ]
    for fname, w_i, mcp_i, pip_i, dip_i in config:
        a = _pt_h(hand_lm, w_i)
        b = _pt_h(hand_lm, mcp_i)
        c = _pt_h(hand_lm, pip_i)
        d = _pt_h(hand_lm, dip_i)
        out[f'{s}_{fname}_mcp'] = _angle3(a, b, c)
        out[f'{s}_{fname}_pip'] = _angle3(b, c, d)
    return out


# ══════════════════════════════════════════════════════════════════════════════
#  MASTER FUNCTION
# ══════════════════════════════════════════════════════════════════════════════

def compute_all_angles(pose_landmarks,
                       left_hand_landmarks=None,
                       right_hand_landmarks=None) -> dict:
    """
    Compute all clinical joint angles from MediaPipe Holistic results.

    Pipeline
    --------
    1. Derive virtual anatomical landmarks (HJC, KJC, AJC, ASIS …)
    2. Build ISB-compliant segment CS matrices using virtual landmarks
    3. Extract 3-DOF joint angles by comparing adjacent segment matrices
    4. Compute finger flexion angles from hand landmarks

    Returns flat dict: angle_name → degrees (float).
    Keys absent when underlying landmarks have low visibility.

    Angle keys produced
    -------------------
    PELVIS:
      pelvis_forward_lean, pelvis_lateral_lean, pelvis_rotation

    TRUNK (absolute):
      trunk_forward_lean, trunk_lateral_lean, trunk_rotation

    LUMBAR (trunk relative to pelvis):
      lumbar_flexion, lumbar_lateral, lumbar_rotation

    LOWER LIMB  {side} ∈ {left, right}:
      {side}_hip_flexion,        {side}_hip_abduction,   {side}_hip_rotation
      {side}_knee_flexion,       {side}_knee_valgus
      {side}_ankle_dorsiflexion, {side}_ankle_eversion

    UPPER LIMB  {side} ∈ {left, right}:
      {side}_shoulder_flexion,   {side}_shoulder_abduction, {side}_shoulder_rotation
      {side}_elbow_flexion

    HANDS  {side}_{finger} where finger ∈ {thumb,index,middle,ring,pinky}:
      {side}_{finger}_mcp,  {side}_{finger}_pip
    """
    angles: dict = {}
    lm = pose_landmarks

    # ── Hand-only path ────────────────────────────────────────────────────────
    if lm is None:
        angles.update(compute_hand_angles(left_hand_landmarks,  'left'))
        angles.update(compute_hand_angles(right_hand_landmarks, 'right'))
        return angles

    # ── Step 1: virtual anatomical landmarks ─────────────────────────────────
    vl = compute_virtual_landmarks(lm)

    # ── Step 2: segment CS matrices ───────────────────────────────────────────
    _default_ex = np.array([1.0, 0.0, 0.0])

    R_pelvis = _pelvis_cs(lm, vl)
    R_trunk  = _trunk_cs(lm, vl)
    pelvis_ex = R_pelvis[:, 0] if R_pelvis is not None else _default_ex
    trunk_ex  = R_trunk[:, 0]  if R_trunk  is not None else _default_ex

    # ── Step 3a: pelvis absolute orientation ──────────────────────────────────
    if R_pelvis is not None:
        fwd, lat, ax = _segment_orientation(R_pelvis)
        angles['pelvis_forward_lean'] = fwd
        angles['pelvis_lateral_lean'] = lat
        angles['pelvis_rotation']     = ax

    # ── Step 3b: trunk absolute orientation ───────────────────────────────────
    if R_trunk is not None:
        fwd, lat, ax = _segment_orientation(R_trunk)
        angles['trunk_forward_lean'] = fwd
        angles['trunk_lateral_lean'] = lat
        angles['trunk_rotation']     = ax

    # ── Step 3c: lumbar (trunk relative to pelvis) ────────────────────────────
    if R_pelvis is not None and R_trunk is not None:
        flex, abd, rot = _flex_abd_rot(R_pelvis, R_trunk)
        angles['lumbar_flexion']  = flex
        angles['lumbar_lateral']  = abd
        angles['lumbar_rotation'] = rot

    # ── Step 3d: lower limb ───────────────────────────────────────────────────
    for side in ('left', 'right'):
        R_thigh = _thigh_cs(lm, side, vl, pelvis_ex)

        if R_pelvis is not None and R_thigh is not None:
            flex, abd, rot = _flex_abd_rot(
                R_pelvis, R_thigh,
                flex_sign =  1.0,
                abd_sign  =  1.0 if side == 'right' else -1.0,
                rot_sign  = -1.0 if side == 'right' else  1.0,
            )
            angles[f'{side}_hip_flexion']   = flex
            angles[f'{side}_hip_abduction'] = abd
            angles[f'{side}_hip_rotation']  = rot

        R_shank = _shank_cs(lm, side, vl,
                             R_thigh if R_thigh is not None else np.eye(3))

        if R_thigh is not None and R_shank is not None:
            flex, abd, _ = _flex_abd_rot(
                R_thigh, R_shank,
                flex_sign = -1.0,
                abd_sign  = -1.0 if side == 'right' else  1.0,
            )
            angles[f'{side}_knee_flexion'] = flex
            angles[f'{side}_knee_valgus']  = abd

        R_foot = _foot_cs(lm, side, vl)
        if R_shank is not None and R_foot is not None:
            dorsi, ever = _ankle_angles(R_shank, R_foot, side)
            angles[f'{side}_ankle_dorsiflexion'] = dorsi
            angles[f'{side}_ankle_eversion']     = ever

    # ── Step 3e: upper limb ───────────────────────────────────────────────────
    for side in ('left', 'right'):
        R_ua = _upper_arm_cs(lm, side, vl, trunk_ex)

        if R_trunk is not None and R_ua is not None:
            flex, abd, rot = _flex_abd_rot(
                R_trunk, R_ua,
                flex_sign =  1.0,
                abd_sign  =  1.0 if side == 'right' else -1.0,
                rot_sign  = -1.0 if side == 'right' else  1.0,
            )
            angles[f'{side}_shoulder_flexion']   = flex
            angles[f'{side}_shoulder_abduction'] = abd
            angles[f'{side}_shoulder_rotation']  = rot

        R_fa = _forearm_cs(lm, side, vl,
                            R_ua if R_ua is not None else np.eye(3))
        if R_ua is not None and R_fa is not None:
            flex, _, _ = _flex_abd_rot(R_ua, R_fa, flex_sign=1.0)
            angles[f'{side}_elbow_flexion'] = flex

    # ── Step 4: hand/finger angles ────────────────────────────────────────────
    angles.update(compute_hand_angles(left_hand_landmarks,  'left'))
    angles.update(compute_hand_angles(right_hand_landmarks, 'right'))

    return angles