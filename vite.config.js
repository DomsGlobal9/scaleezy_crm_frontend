import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 5176: Inventory's app is on 5173 and the till on 5175, and all three are opened side by side.
export default defineConfig({
  plugins: [react()],
  server: { port: 5176, strictPort: true },
})
