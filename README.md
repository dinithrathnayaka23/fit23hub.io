# 🎓 FIT23Hub

> **The Official Digital Platform for the Faculty of Information Technology Batch 23**
>
> Preview
> <p align="center">
  <img src="frontend/public/Screenshot 2026-05-24 234141.png" alt="FIT23Hub Preview" width="100%">
</p>

FIT23Hub is a centralized web platform designed to connect students, streamline academic collaboration, and provide a modern digital experience for the Faculty of Information Technology (FIT) Batch 23.

The platform serves as a one-stop destination for sharing learning resources, managing student profiles, accessing announcements, exploring galleries, and fostering collaboration within the batch.

---

# ✨ Features

## 👨‍🎓 Student Portal
- Student registration and authentication
- Personal profile management
- Batch directory
- Profile customization

## 📚 Learning Resources
- Upload and share lecture notes
- Store academic documents
- Organize learning materials
- Share useful links and references
- Categorized resource management

## 🖼️ Gallery
- Event photo galleries
- University memories
- Batch activities
- Media organization

## 📢 Announcements
- Batch-wide announcements
- Important academic updates
- Event notifications
- News and notices

## 🤖 AI-Assisted Learning
- Intelligent learning assistance
- Resource discovery
- Academic support features
- Future AI integrations

## 🔐 Authentication & Security
- Secure login system
- Role-based authorization
- Protected resources
- User session management

## 🛠️ Admin Dashboard
- User management
- Content moderation
- Resource management
- Announcement publishing
- Platform administration

---

# 🏗️ System Architecture

FIT23Hub follows a modern full-stack architecture designed for scalability and maintainability.

```
                    +------------------------+
                    |      Next.js Frontend  |
                    +-----------+------------+
                                |
                                |
                           REST APIs
                                |
                                ▼
                    +------------------------+
                    |     Backend Server      |
                    +-----------+------------+
                                |
                                |
                    -------------------------
                    |                       |
                    ▼                       ▼
             Authentication          Application Logic
                    |                       |
                    -------------------------
                                |
                                ▼
                          MongoDB Database
```

---

# 🛠️ Technology Stack

## Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS

## Backend
- Node.js
- Express.js

## Database
- MongoDB

## Authentication
- JWT-based Authentication

## Deployment Ready
- Modern scalable architecture
- API-driven design
- Responsive UI
- Mobile-friendly interface

---

# 📁 Project Structure

```text
FIT23Hub/
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── lib/
│   └── public/
│
├── backend/
│   ├── controllers/
│   ├── routes/
│   ├── middleware/
│   ├── models/
│   ├── services/
│   ├── config/
│   └── utils/
│
├── database/
│
├── docs/
│
└── README.md
```

---

# 🚀 Getting Started

## Clone the Repository

```bash
git clone https://github.com/dinithrathnayaka23/fit23hub.io.git
cd fit23hub.io
```

---

# ⚙️ Frontend Setup

Navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The frontend will typically be available at:

```
http://localhost:3000
```

---

# ⚙️ Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm run dev
```

The backend API will typically run on:

```
http://localhost:5000
```

---

# 🔐 Environment Variables

Create a `.env` file in the backend project.

Example:

```env
PORT=5000

MONGODB_URI=your_mongodb_connection_string

JWT_SECRET=your_secret_key

NODE_ENV=development
```

> Never commit your `.env` file or sensitive credentials to version control.

---

# 🌟 Key Capabilities

- 🎓 Student community platform
- 📚 Centralized learning resource hub
- 🖼️ Gallery management
- 📢 Batch announcements
- 🔐 Secure authentication
- 👤 Student profile management
- 🤖 AI-powered learning support
- 📱 Responsive design
- ⚡ Fast and scalable architecture
- 🛠️ Administrative dashboard

---

# 🔮 Future Enhancements

- Live chat between students
- AI-powered note summarization
- Smart resource recommendations
- Event registration system
- Internship and job board
- Calendar integration
- Notification center
- Discussion forums
- Dark mode improvements
- Progressive Web App (PWA) support

---

# 🎯 Vision

FIT23Hub aims to become the official digital ecosystem for the Faculty of Information Technology Batch 23 by improving collaboration, simplifying access to academic resources, and creating a connected student community.

---

# 🤝 Contributing

Contributions are welcome! Feel free to fork the repository, submit issues, and create pull requests to improve the platform.

---

# 📄 License

This project is developed for educational purposes and as part of academic initiatives within the Faculty of Information Technology.

---

## ⭐ Support the Project

If you find FIT23Hub useful, consider starring the repository and contributing to its growth!
