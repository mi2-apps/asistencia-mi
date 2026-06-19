// PM2 ecosystem — runs the built Express server in production.
// Coolify build pipeline runs `npm run build` then `npm start`.
module.exports = {
  apps: [
    {
      name: "asistencia-mi",
      script: "dist/server/index.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
