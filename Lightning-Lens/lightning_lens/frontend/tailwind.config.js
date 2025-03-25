module.exports = {
  purge: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {
      colors: {
        // Primary Colors
        'bitcoin-orange': '#F7931A',
        'lightning-blue': '#3D8EF7',
        'lightning-purple': '#7B3DFF',

        // Secondary Colors
        'node-green': '#36B37E',
        'channel-yellow': '#FFD700',
        'satoshi-white': '#F8F9FA',

        // Accent Colors
        'warning-red': '#FF4136',
        'dark-node': '#10151F',
        'lightning-pulse': '#7B3DFF',

        // Background Options
        'lightning-dark': '#121923',
        'node-background': '#1A2233',
        'channel-panel': '#232F46',
      },
      gradientColorStops: {
        'lightning-start': '#3D8EF7',
        'lightning-end': '#7B3DFF',
        'success-start': '#36B37E',
        'success-end': '#2DCE89',
        'channel-start': '#FFD700',
        'channel-end': '#F7931A',
        'critical-start': '#FF4136',
        'critical-end': '#FF785A',
      },
      boxShadow: {
        'lightning-glow': '0 0 15px rgba(61, 142, 247, 0.5)',
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
};
