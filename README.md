# Personal Accounting App

A web-based personal accounting application built with React, TypeScript, and Tailwind CSS.

## Features 

- **Accounting**: Record daily income and expenses.
- **Categories**: Manage multi-level categories.
- **Accounts**: Manage multiple accounts (Bank, WeChat, Alipay, etc.) with multi-currency support.
- **Statistics**: Visual charts for income, expense, and assets.
- **Storage**: LocalStorage persistence with Cloudflare R2 sync (Backup/Restore).
- **AI Accounting**: Parse natural language with Zhipu `glm-5.3-flash` and receipt images with `glm-4.6v-flashx`.

## Getting Started 

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Configuration

- **AI Accounting**: Go to "Storage", enable AI Accounting, and enter a Zhipu BigModel API key. Receipt images are resized, converted to grayscale, and JPEG-compressed locally before they are sent.
- **Cloud Sync**: Go to "Storage" page, enter your Cloudflare R2 credentials (Endpoint, Access Key, Secret Key, Bucket Name).

## Tech Stack

- React 18
- TypeScript
- Tailwind CSS
- Chart.js
- JSZip
- AWS SDK (for R2)
- Zhipu BigModel API
