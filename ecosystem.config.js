// ~/projects/meridian/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "meridian",
      script: "npm",
      args: "run start",
      cwd: "/home/karkyon/projects/meridian",
      env: {
        NODE_ENV: "production",
        PORT: "3025",
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};