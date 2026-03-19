^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
Changelog for package system_webview
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Forthcoming
-----------

0.0.1 (2026-03-07)
------------------
* feat: update styles and build manifests for improved UI and performance
  - Added new Tailwind CSS file for styling enhancements.
  - Created new build manifest and SSG manifest files for better routing and static generation.
  - Updated index.html to reference new CSS and JS files, ensuring the latest styles and scripts are loaded.
  - Adjusted index.txt to reflect changes in the build process and resource references.
* feat: add initial build files for ROS2 System Monitor
  - Added webpack chunk for optimized JavaScript loading.
  - Included Tailwind CSS for styling with a new CSS file.
  - Created build manifest and SSG manifest for static site generation.
  - Generated index.html with structured layout and initial content.
  - Added index.txt for internal routing and component management.
* docs: update README.md with project overview, features, architecture, prerequisites, and usage instructions
* feat: initialize web application with Next.js and TypeScript
  - Added package.json for project dependencies and scripts.
  - Created postcss.config.mjs for Tailwind CSS integration.
  - Set up tailwind.config.ts for Tailwind CSS configuration.
  - Added tsconfig.json for TypeScript compiler options.
  - Defined ROS-related types in ros.ts for log messages and connection statuses.
  - Created roslib.d.ts for type definitions of the roslib library.
  - Implemented system.ts to define interfaces for system statistics and resource usage.
* Initial commit: Add basic structure for system_webview with HTTP server and web interface
* Initial commit
* Contributors: David Brown
