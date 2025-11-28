import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载当前环境的环境变量（支持 .env 文件和系统环境变量）
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // 关键配置：在构建时将 process.env.API_KEY 替换为字符串常量
      // 这样浏览器中就不会出现 'process is not defined' 的错误
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY)
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});