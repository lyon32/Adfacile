# Adfacile 🚀

Adfacile is a powerful SaaS platform designed to automate and simplify Facebook/Meta Ad creation, management, and analytics. It provides users with an intuitive dashboard to launch ad campaigns efficiently, powered by AI and data-driven insights.

## Features ✨
- **Automated Campaign Creation**: Easily launch Meta ad campaigns with our streamlined interface.
- **AI-Powered Copywriting**: Generate compelling ad text and creatives with integrated AI tools.
- **Analytics Dashboard**: Track the performance of your campaigns in real-time.
- **Facebook Graph API Integration**: Seamlessly connect your Facebook pages and ad accounts.
- **User Management**: Authentication, profiles, and plan limits.

## Tech Stack 🛠️
- **Frontend**: React, Vite, TailwindCSS (or Vanilla CSS depending on modules)
- **Backend**: Node.js, Express
- **Database**: PostgreSQL / SQLite (managed via Prisma/Sequelize)
- **Integrations**: Facebook Graph API, AI Services

## Getting Started 🚀

### Prerequisites
Make sure you have Node.js and npm/yarn installed on your machine.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/lyon32/Adfacile.git
   cd Adfacile
   ```

2. Install dependencies for backend and frontend:
   ```bash
   # Install backend dependencies
   cd backend
   npm install

   # Install frontend dependencies
   cd ../frontend
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env` file in both `backend` and `frontend` directories using the `.env.example` templates and fill in your keys (Database URI, Facebook App ID/Secret, JWT Secret, etc.).

4. Start the application:
   ```bash
   # Start backend server
   cd backend
   npm run dev

   # Start frontend application
   cd ../frontend
   npm run dev
   ```

## License 📄
This project is proprietary and confidential. Unauthorized copying of this file, via any medium is strictly prohibited.
