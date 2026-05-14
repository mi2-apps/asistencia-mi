// PM2 ecosystem — runs the built Express server in production.
// Coolify build pipeline runs `npm run build` then `npm start`.
module.exports = {
  apps: [
    {
      name: "stack-template",
      script: "dist/server/index.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 7000,
      },
    },
  ],
};
