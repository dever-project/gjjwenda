<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6b0c0bfa-3481-4a08-aa21-cb9b1fd9bfdd

## Run Locally

**Prerequisites:**  Node.js 22+ (uses the built-in `node:sqlite` module)


1. Install dependencies:
   `npm install`
2. Optional: set `SQLITE_DB_PATH` in `.env.local` to choose the SQLite file path. The default is `data/gjj.sqlite`.
3. Configure OpenAI-compatible AI training settings in Admin > 基础设置.
4. Run the app:
   `npm run dev`
