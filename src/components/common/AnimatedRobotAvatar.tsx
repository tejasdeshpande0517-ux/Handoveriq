import React, { useEffect, useState } from 'react';

type EyeExpression = 'HAPPY_ARC' | 'ROUND_LED' | 'BLINK' | 'WINK_LEFT' | 'WINK_RIGHT';

export const AnimatedRobotAvatar: React.FC<{ className?: string }> = ({
  className = 'w-26 h-26',
}) => {
  // 1. Random Eye Expression & Unpredictable Blinking
  const [eyeState, setEyeState] = useState<EyeExpression>('HAPPY_ARC');
  // 2. Random Gaze Offset (x, y) inside the visor
  const [gaze, setGaze] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // 3. Random Head Tilt & Vertical Bob
  const [headPose, setHeadPose] = useState<{ rotate: number; y: number }>({
    rotate: -2,
    y: 0,
  });
  // 4. Random Antenna Twitch Angle & Signal Burst
  const [antennaPose, setAntennaPose] = useState<{
    angle: number;
    pulse: boolean;
  }>({ angle: 4, pulse: false });
  // 5. Random Thumbs-Up Hand Bounce
  const [thumbAngle, setThumbAngle] = useState<number>(0);
  // 6. Random Chat Bubble Typing Dot Highlight (0, 1, 2)
  const [activeDot, setActiveDot] = useState<number>(0);

  // Randomized Eye Blinking & Expression Timer (non-scripted, organic intervals)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let innerTimeoutId: ReturnType<typeof setTimeout>;
    let thirdTimeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextBlink = () => {
      // Random delay between 1.1s and 4.4s
      const nextDelay = 1100 + Math.random() * 3300;
      timeoutId = setTimeout(() => {
        const roll = Math.random();
        if (roll < 0.45) {
          // Quick single blink then return to HAPPY_ARC or ROUND_LED
          setEyeState('BLINK');
          innerTimeoutId = setTimeout(() => {
            setEyeState(Math.random() < 0.68 ? 'HAPPY_ARC' : 'ROUND_LED');
            scheduleNextBlink();
          }, 110 + Math.random() * 70);
        } else if (roll < 0.72) {
          // Realistic rapid double-blink
          setEyeState('BLINK');
          innerTimeoutId = setTimeout(() => {
            setEyeState('HAPPY_ARC');
            thirdTimeoutId = setTimeout(() => {
              setEyeState('BLINK');
              setTimeout(() => {
                setEyeState(Math.random() < 0.7 ? 'HAPPY_ARC' : 'ROUND_LED');
                scheduleNextBlink();
              }, 100);
            }, 95);
          }, 105);
        } else if (roll < 0.86) {
          // Playful random wink
          setEyeState(Math.random() < 0.5 ? 'WINK_LEFT' : 'WINK_RIGHT');
          innerTimeoutId = setTimeout(() => {
            setEyeState('HAPPY_ARC');
            scheduleNextBlink();
          }, 320 + Math.random() * 260);
        } else {
          // Switch between curved happy LED arcs (^ ^) and curious round LED eyes
          setEyeState((prev) =>
            prev === 'HAPPY_ARC' ? 'ROUND_LED' : 'HAPPY_ARC'
          );
          scheduleNextBlink();
        }
      }, nextDelay);
    };

    scheduleNextBlink();
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(innerTimeoutId);
      clearTimeout(thirdTimeoutId);
    };
  }, []);

  // Randomized Eye Gaze Timer
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleGaze = () => {
      const delay = 1300 + Math.random() * 2900;
      timeoutId = setTimeout(() => {
        // 40% chance to look center, 60% chance to glance randomly
        if (Math.random() < 0.4) {
          setGaze({ x: 0, y: 0 });
        } else {
          setGaze({
            x: Number(((Math.random() - 0.5) * 6.5).toFixed(2)),
            y: Number(((Math.random() - 0.5) * 3.5).toFixed(2)),
          });
        }
        scheduleGaze();
      }, delay);
    };
    scheduleGaze();
    return () => clearTimeout(timeoutId);
  }, []);

  // Randomized Head Tilt & Bob Timer
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleHead = () => {
      const delay = 1500 + Math.random() * 2800;
      timeoutId = setTimeout(() => {
        setHeadPose({
          rotate: Number(((Math.random() - 0.45) * 9).toFixed(2)),
          y: Number(((Math.random() - 0.5) * 4.5).toFixed(2)),
        });
        scheduleHead();
      }, delay);
    };
    scheduleHead();
    return () => clearTimeout(timeoutId);
  }, []);

  // Randomized Antenna Sway & Telemetry Flash Timer
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleAntenna = () => {
      const delay = 850 + Math.random() * 2400;
      timeoutId = setTimeout(() => {
        setAntennaPose({
          angle: Number(((Math.random() - 0.5) * 28).toFixed(2)),
          pulse: Math.random() < 0.65,
        });
        scheduleAntenna();
      }, delay);
    };
    scheduleAntenna();
    return () => clearTimeout(timeoutId);
  }, []);

  // Randomized Thumbs-Up Gesture & Chest Chat Dots Timer
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleThumb = () => {
      const delay = 1200 + Math.random() * 2600;
      timeoutId = setTimeout(() => {
        setThumbAngle(Number(((Math.random() - 0.35) * 14).toFixed(2)));
        setActiveDot(Math.floor(Math.random() * 3));
        scheduleThumb();
      }, delay);
    };
    scheduleThumb();
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div className={`${className} shrink-0 select-none relative`}>
      <svg
        viewBox="0 0 160 160"
        className="w-full h-full drop-shadow-[0_8px_20px_rgba(0,229,255,0.32)] overflow-visible"
      >
        <defs>
          {/* 3D Brushed White/Silver Metallic Helmet & Body Gradient */}
          <linearGradient id="botMetal3D" x1="25" y1="18" x2="135" y2="145" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="38%" stopColor="#e2e8f0" />
            <stop offset="74%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>

          {/* Dark Gunmetal Joint & Headphone Shell Gradient */}
          <linearGradient id="botGunmetal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="50%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>

          {/* Glossy Black Visor Gradient */}
          <linearGradient id="botVisorGlass" x1="40" y1="32" x2="120" y2="95" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="45%" stopColor="#020617" />
            <stop offset="100%" stopColor="#042f2e" />
          </linearGradient>

          {/* Translucent Cyan Antenna Orb Gradient */}
          <radialGradient id="botOrbGlow" cx="38%" cy="32%" r="65%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#67e8f9" />
            <stop offset="80%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0284c7" />
          </radialGradient>

          {/* Neon Cyan LED Glow Filter */}
          <filter id="cyanNeonGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* =================================================================
            1. TORSO, LEFT ARM & CHEST CHAT-BUBBLE REACTOR
        ================================================================= */}
        {/* Left Hanging Mechanical Arm (Viewer's Right) */}
        <g
          style={{
            transform: `rotate(${(-thumbAngle * 0.4).toFixed(2)}deg)`,
            transformOrigin: '124px 112px',
            transition: 'transform 650ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {/* Dark Mechanical Shoulder & Elbow Joint */}
          <circle cx="123" cy="113" r="8" fill="url(#botGunmetal)" />
          <path
            d="M122 117 L134 139 L123 144 L114 122 Z"
            fill="url(#botMetal3D)"
            stroke="#64748b"
            strokeWidth="1"
          />
          <circle cx="130" cy="143" r="5.5" fill="url(#botGunmetal)" />
        </g>

        {/* Neck Dark Metallic Ring */}
        <ellipse cx="82" cy="94" rx="22" ry="6" fill="url(#botGunmetal)" />
        <ellipse
          cx="82"
          cy="94"
          rx="18"
          ry="3.5"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1"
          opacity="0.55"
        />

        {/* 3D Rounded Metallic Torso */}
        <path
          d="M47 98 C47 91, 117 91, 117 98 C124 116, 121 138, 110 149 C96 154, 68 154, 54 149 C43 138, 40 116, 47 98 Z"
          fill="url(#botMetal3D)"
          stroke="#cbd5e1"
          strokeWidth="1.2"
        />
        {/* Subtle Metallic Panel Seams on Torso */}
        <path
          d="M57 136 L63 150 M107 136 L101 150"
          stroke="#475569"
          strokeWidth="1"
          opacity="0.55"
        />

        {/* Glowing Cyan Chest Core Ring with Chat Bubble & 3 Dots */}
        <g transform="translate(88, 121)">
          {/* Outer Neon Cyan Halo */}
          <circle
            cx="0"
            cy="0"
            r="18.5"
            fill="#042f2e"
            stroke="#22d3ee"
            strokeWidth="2.6"
            filter="url(#cyanNeonGlow)"
          />
          <circle cx="0" cy="0" r="15.5" fill="#082f49" />
          {/* Chat Bubble Icon Inside Chest */}
          <path
            d="M-7.5 -6.5 H7.5 C9.2 -6.5 10.5 -5.2 10.5 -3.5 V3.5 C10.5 5.2 9.2 6.5 7.5 6.5 H-2.5 L-7.5 10 V6.5 H-7.5 C-9.2 6.5 -10.5 5.2 -10.5 3.5 V-3.5 C-10.5 -5.2 -9.2 -6.5 -7.5 -6.5 Z"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeLinejoin="round"
            filter="url(#cyanNeonGlow)"
          />
          {/* 3 Animated Typing Dots inside Chat Bubble */}
          {[-4.5, 0, 4.5].map((dx, i) => (
            <circle
              key={i}
              cx={dx}
              cy="0"
              r={activeDot === i ? 1.9 : 1.35}
              fill={activeDot === i ? '#ffffff' : '#38bdf8'}
              style={{ transition: 'all 300ms ease' }}
            />
          ))}
        </g>

        {/* =================================================================
            2. 3D SEGMENTED THUMBS-UP RIGHT ARM & HAND (Viewer's Left)
        ================================================================= */}
        <g
          style={{
            transform: `rotate(${thumbAngle}deg)`,
            transformOrigin: '46px 112px',
            transition: 'transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {/* Shoulder Ball Joint & Outer Forearm Cuff */}
          <ellipse cx="36" cy="112" rx="14" ry="16" fill="url(#botMetal3D)" stroke="#94a3b8" strokeWidth="1" />
          <ellipse cx="42" cy="109" rx="11" ry="13" fill="url(#botGunmetal)" />
          {/* Palm & Thumb Base */}
          <rect x="36" y="94" width="16" height="24" rx="7" fill="url(#botMetal3D)" stroke="#64748b" strokeWidth="1" />
          {/* Raised Thumbs-Up Thumb! */}
          <path
            d="M39 95 C38 86, 40 79, 44 79 C48 79, 50 86, 49 95 Z"
            fill="url(#botMetal3D)"
            stroke="#64748b"
            strokeWidth="1.1"
          />
          {/* Thumb Joint Seam */}
          <line x1="40" y1="88" x2="48" y2="88" stroke="#334155" strokeWidth="1.3" />
          {/* 3 Curled Mechanical Fingers */}
          <rect x="44" y="95" width="15" height="6.2" rx="3.1" fill="url(#botMetal3D)" stroke="#475569" strokeWidth="1" />
          <rect x="45" y="102" width="15" height="6.2" rx="3.1" fill="url(#botMetal3D)" stroke="#475569" strokeWidth="1" />
          <rect x="44" y="109" width="14" height="6.2" rx="3.1" fill="url(#botMetal3D)" stroke="#475569" strokeWidth="1" />
        </g>

        {/* =================================================================
            3. ANIMATED 3D HELMET HEAD, HEADPHONES, VISOR & RANDOM LED EYES
        ================================================================= */}
        <g
          style={{
            transform: `translateY(${headPose.y}px) rotate(${headPose.rotate}deg)`,
            transformOrigin: '82px 62px',
            transition: 'transform 620ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {/* Top Antenna with Random Sway & Glowing Cyan Orb */}
          <g
            style={{
              transform: `rotate(${antennaPose.angle}deg)`,
              transformOrigin: '86px 26px',
              transition: 'transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {/* Antenna Base Cap */}
            <ellipse cx="86" cy="26" rx="9" ry="3.2" fill="url(#botGunmetal)" stroke="#38bdf8" strokeWidth="1" />
            {/* Metallic Stalk */}
            <line x1="86" y1="12" x2="86" y2="25" stroke="#94a3b8" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="85" y1="12" x2="85" y2="25" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
            {/* Random Signal Burst Ring */}
            {antennaPose.pulse && (
              <circle
                cx="86"
                cy="10"
                r="11"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
                opacity="0.65"
                className="animate-ping"
              />
            )}
            {/* Translucent Glowing Cyan Orb */}
            <circle
              cx="86"
              cy="10"
              r="7.5"
              fill="url(#botOrbGlow)"
              filter="url(#cyanNeonGlow)"
            />
            <circle cx="83.5" cy="7.5" r="2.2" fill="#ffffff" opacity="0.85" />
          </g>

          {/* Left Headphone Ear-Cup with Glowing Cyan Neon Ring */}
          <g transform="translate(27, 56) rotate(-8)">
            <ellipse cx="0" cy="0" rx="8" ry="18" fill="url(#botGunmetal)" />
            <ellipse
              cx="-2"
              cy="0"
              rx="5.5"
              ry="15.5"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2.4"
              filter="url(#cyanNeonGlow)"
            />
            <ellipse cx="-3" cy="0" rx="3.2" ry="9.5" fill="url(#botGunmetal)" stroke="#64748b" strokeWidth="0.8" />
          </g>

          {/* Right Headphone Ear-Cup with Glowing Cyan Neon Ring */}
          <g transform="translate(137, 62) rotate(8)">
            <ellipse cx="0" cy="0" rx="7.5" ry="17" fill="url(#botGunmetal)" />
            <ellipse
              cx="2"
              cy="0"
              rx="5"
              ry="14.5"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2.2"
              filter="url(#cyanNeonGlow)"
            />
          </g>

          {/* Main 3D Rounded Metallic Helmet Head */}
          <rect
            x="31"
            y="25"
            width="102"
            height="68"
            rx="33"
            fill="url(#botMetal3D)"
            stroke="#e2e8f0"
            strokeWidth="1.5"
          />
          {/* Subtle Metallic Scratches / Panel Seams for Realism */}
          <path
            d="M52 29 L55 35 M114 31 L111 37 M45 78 L50 83"
            stroke="#475569"
            strokeWidth="0.9"
            opacity="0.55"
          />

          {/* Curved Glossy Black Glass Visor Screen */}
          <rect
            x="43"
            y="36"
            width="80"
            height="46"
            rx="20"
            fill="url(#botVisorGlass)"
            stroke="#1e293b"
            strokeWidth="2.2"
          />
          {/* Top-Right Glass Specular Reflection on Visor */}
          <path
            d="M95 40 C108 40, 117 46, 118 55 C112 48, 103 44, 92 43 Z"
            fill="#ffffff"
            opacity="0.16"
          />

          {/* LED Cyan Face (Moves Randomly with Gaze!) */}
          <g
            style={{
              transform: `translate(${gaze.x}px, ${gaze.y}px)`,
              transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            filter="url(#cyanNeonGlow)"
          >
            {/* LEFT EYE */}
            {eyeState === 'BLINK' || eyeState === 'WINK_LEFT' ? (
              <line
                x1="56"
                y1="56"
                x2="74"
                y2="56"
                stroke="#38bdf8"
                strokeWidth="4.2"
                strokeLinecap="round"
              />
            ) : eyeState === 'ROUND_LED' ? (
              <g>
                <circle cx="65" cy="55" r="7.5" fill="#22d3ee" />
                <circle cx="67.5" cy="52.5" r="2.5" fill="#ffffff" />
              </g>
            ) : (
              /* Happy Curved LED Arc Eye (^ matching uploaded image!) */
              <path
                d="M56 59 C58 49, 72 49, 74 59"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="5.2"
                strokeLinecap="round"
                strokeDasharray="1.5 0.6"
              />
            )}

            {/* RIGHT EYE */}
            {eyeState === 'BLINK' || eyeState === 'WINK_RIGHT' ? (
              <line
                x1="93"
                y1="56"
                x2="111"
                y2="56"
                stroke="#38bdf8"
                strokeWidth="4.2"
                strokeLinecap="round"
              />
            ) : eyeState === 'ROUND_LED' ? (
              <g>
                <circle cx="102" cy="55" r="7.5" fill="#22d3ee" />
                <circle cx="104.5" cy="52.5" r="2.5" fill="#ffffff" />
              </g>
            ) : (
              /* Happy Curved LED Arc Eye (^ matching uploaded image!) */
              <path
                d="M93 59 C95 49, 109 49, 111 59"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="5.2"
                strokeLinecap="round"
                strokeDasharray="1.5 0.6"
              />
            )}

            {/* LED Dot-Matrix Smile */}
            <path
              d={
                eyeState === 'ROUND_LED'
                  ? 'M76 68 C80 73, 88 73, 92 68'
                  : 'M75 67 C79 74, 89 74, 93 67'
              }
              fill="none"
              stroke="#38bdf8"
              strokeWidth="4.4"
              strokeLinecap="round"
            />
          </g>
        </g>
      </svg>
    </div>
  );
};
