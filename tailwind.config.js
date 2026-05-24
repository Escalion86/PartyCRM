/** @type {import('tailwindcss').Config} */

// const plugin = require('tailwindcss/plugin')

module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './helpers/**/*.{js,jsx}',
    './layouts/**/*.{js,jsx}',
    './blocks/**/*.{js,jsx}',
    // './public/**/*.{svg}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'inter-tight': ['Inter Tight'],
        buyan: ['Buyan'],
        futuraPT: ['Futura PT'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        check: "url('/icons/check.svg')",
        radio: "url('/icons/radio.svg')",
      },
      boxShadow: {
        button:
          '6px 6px 26px 0px rgba(255, 255, 255, 0.35) inset, 0px 25px 36px 0px rgba(255, 255, 255, 0.20) inset',
      },
      colors: {
        general: '#EBD3A5',
        button: 'linear-gradient(63deg, #C9A86A 0%, #EBD3A5 100%)',
        'button-hover':
          'linear-gradient(45deg, #B88F52 0%, #E1C993 47.23%, #EBD3A5 100%)',
        'button-push':
          'linear-gradient(0deg, rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.05) 100%), linear-gradient(45deg, #B88F52 0%, #E1C993 47.23%, #EBD3A5 100%)',

        header: '#4D9DC4',
        'general-light': '#F4E7C8',
        primary: '#2A323B',
        secondary: '#D3D0C9',
        third: '#176D8F',
        bg: '#f7f9fa',
        toxic: '#6ad424',
        success: '#008800',
        danger: '#AA0000',
        hover: '#C8E3F4',
        text: '#192129',
        input: '#2A323B',
        disabled: '#9ca3af',
        black: '#1C1D1F',
      },
      backgroundSize: {
        'size-200': '200% 200%',
        'size-300': '300% 300%',
      },
      backgroundPosition: {
        'pos-0': '2% 2%',
        'pos-50': '2% 98%',
        'pos-100': '98% 98%',
      },
      inset: {
        menu: '3.75rem',
        title: '3.80rem',
        18: '4.5rem',
        '-18': '-4.5rem',
        22: '5.5rem',
        15: '3.75rem',
      },
      rotate: {
        '-15': '-15deg',
        15: '15deg',
      },
      animation: {
        'pulse-light': 'pulse-light 2s ease-in-out infinite',
        'ping-light': 'ping-light 1s cubic-bezier(0, 0, 0.2, 1) infinite',
        'shadow-pulse': 'shadow-pulse 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
      keyframes: {
        'pulse-light': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.03)' },
        },
        'ping-light': {
          '75%, 100%': {
            transform: 'scale(1.3)',
            opacity: 0,
          },
        },
        'shadow-pulse': {
          '0%': {
            boxShadow: '0 0 0 0 rgba(0,0,0,0.1)',
          },
          '50%': {
            boxShadow: '0 0 3px 3px rgba(0,0,0,0.1)',
          },
        },
      },
      minWidth: {
        label: '14vw',
        1: '0.25rem',
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        7: '1.75rem',
        8: '2rem',
        9: '2.25rem',
        10: '2.5rem',
        12: '3rem',
        13: '3.25rem',
        14: '3.5rem',
        16: '4rem',
        20: '5rem',
        22: '5.5rem',
        24: '6rem',
        32: '8rem',
        36: '9rem',
        40: '10rem',
        44: '11rem',
        48: '12rem',
        72: '18rem',
        76: '19rem',
        84: '21rem',
        88: '22rem',
        100: '25rem',
        112: '28rem',
        116: '29rem',
        120: '30rem',
        140: '35rem',
        156: '39rem',
        160: '40rem',
        180: '45rem',
        200: '50rem',
        220: '55rem',
        228: '57rem',
        240: '60rem',
      },
      maxWidth: {
        label: '14vw',
        // 4: '1rem',
        6: '1.5rem',
        8: '2rem',
        12: '3rem',
        13: '3.25rem',
        14: '3.5rem',
        16: '4rem',
        20: '5rem',
        24: '6rem',
        // 32: '8rem',
        30: '7.5rem',
        40: '10rem',
        48: '12rem',
        60: '15rem',
        80: '20rem',
        100: '25rem',
        120: '30rem',
        124: '31rem',
        128: '32rem',
        132: '33rem',
        140: '35rem',
        248: '62rem',
        284: '71rem',
      },
      minHeight: {
        5: '1.25rem',
        6: '1.5rem',
        8: '2rem',
        20: '5rem',
        44: '11rem',
        48: '12rem',
        72: '18rem',
        100: '25rem',
        192: '46rem',
      },
      maxHeight: {
        8: '2rem',
        10: '2.5rem',
        12: '3rem',
        13: '3.25rem',
        14: '3.5rem',
        15: '3.75rem',
        16: '4rem',
        18: '4.5rem',
        22: '5.5rem',
        200: '50rem',
        1000: '250rem',
      },
      cursor: {
        'zoom-in': 'zoom-in',
      },
      boxShadow: {
        card: '0 10px 28px rgba(27, 24, 18, 0.22)',
        light: '1px 5px 4px 0 rgba(0, 0, 0, 0.20)',
        medium: '1px 4px 5px 0 rgba(0, 0, 0, 0.30)',
        large: '1px 3px 6px 0 rgba(0, 0, 0, 0.40)',
        // sm: '0 3px 15px 0 rgba(0, 0, 0, 0.10)',
        active:
          '0 0 3px 1px rgba(38, 163, 212, 0.5), 0 0 3px 1px rgba(38, 163, 212, 0.3)',
        'medium-active': '0 1px 4px 5px rgba(38, 163, 212, 0.5)',
        primary: '0px 0px 8px 8px #26A3D4',
        white2: '0px 0px 8px 8px rgba(255, 255, 255, 0.50)',
      },
      spacing: {
        13: '3.25rem',
        15: '3.75rem',
        90: '22.5rem',
        100: '25rem',
      },
      height: {
        17: '4.25rem',
        18: '4.5rem',
        22: '5.5rem',
        30: '7.5rem',
        62: '15.5rem',
        68: '17rem',
        70: '17.5rem',
        82: '20.5rem',
        84: '21rem',
        88: '22rem',
        98: '24.5rem',
        100: '25rem',
        106: '26.5rem',
        112: '28rem',
        116: '29rem',
        118: '29.5rem',
        120: '30rem',
        128: '32rem',
        136: '34rem',
      },
      width: {
        label: '14vw',
        17: '4.25rem',
        18: '4.5rem',
        22: '5.5rem',
        26: '6.65rem',
        34: '8.25rem',
        50: '12.5rem',
        84: '21rem',
        88: '22rem',
        100: '25rem',
        120: '30rem',
        124: '31rem',
        128: '32rem',
        132: '33rem',
        140: '35rem',
        248: '62rem',
        284: '71rem',
      },
      opacity: {
        15: '15%',
      },
      borderWidth: {
        1: '1px',
      },
      transitionDuration: {
        400: '400ms',
      },
    },
    screens: {
      mobile: '375px',
      xs: '375px',
      // => @media (min-width: 640px) { ... }

      phoneH: '420px',

      sm: '640px',
      // => @media (min-width: 640px) { ... }

      md: '768px',
      // => @media (min-width: 768px) { ... }

      tablet: '1024px',
      lg: '1024px',
      // => @media (min-width: 1024px) { ... }

      xl: '1280px',
      // => @media (min-width: 1280px) { ... }

      '2xl': '1536px',
      // => @media (min-width: 1536px) { ... }

      desktop: '1920px',
      '3xl': '1920px',
      // => @media (min-width: 1536px) { ... }
    },
  },
  plugins: [],
}
