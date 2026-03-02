module.exports = {
  content: ["./contents/**/*.{ts,tsx}", "./options/**/*.{ts,tsx}", "./**/*.html"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#f8fafc",
        storm: "#e2e8f0",
        ocean: "#1d4ed8",
        glow: "#0ea5e9"
      },
      fontFamily: {
        display: ["IBM Plex Sans", "ui-sans-serif", "system-ui"],
        body: ["Inter", "ui-sans-serif", "system-ui"]
      }
    }
  },
  plugins: []
}
