# 📊 Habit Tracker

A robust, privacy-focused habit tracking application designed to help you build and maintain good habits. Built with performance and aesthetics in mind, it features a premium dark-mode UI, detailed analytics, and instant interactions.

DASHBOARD PREVIEW
<img width="1919" height="914" alt="image" src="https://github.com/user-attachments/assets/fc98af84-f6f1-4f88-9e1a-f7553883185f" />


## 🚀 Features

-   **Multi-Period Tracking**: Track habits across different timeframes:
    -   **Daily**: Recurring daily routines (e.g., "Drink Water", "Read 30 mins").
    -   **Weekly**: Goals for the week (e.g., "Gym 3x", "Grocery Shopping").
    -   **Monthly**: High-level targets (e.g., "Read 1 Book", "Pay Bills").
    -   **Yearly**: Long-term resolutions.
-   **⚡ High Performance**:
    -   **SQLite Backend**: Fast, reliable data storage (migrated from JSON).
    -   **Optimistic UI**: Instant feedback on clicks without waiting for server round-trips.
-   **📈 Advanced Analytics**:
    -   **Dashboard**: Visual overview of your progress.
    -   **Charts**: Interactive daily, weekly, and monthly trend graphs (powered by Chart.js).
    -   **Streaks**: Track your current and longest streaks to stay motivated.
    -   **KPIs**: At-a-glance metrics like "Today's Completion" and "Monthly Average".
-   **🎨 Premium Design**:
    -   Modern **Dark Mode** aesthetic.
    -   **Glassmorphism** UI elements.
    -   Fully **Responsive** layout for Desktop and Mobile.

## 🛠️ Tech Stack

-   **Backend**: Python (Flask), SQLite
-   **Frontend**: HTML5, CSS3 (Custom Properties, Flexbox/Grid), Vanilla JavaScript
-   **Libraries**: Chart.js (for analytics)

## 📦 Installation & Setup

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/habit-tracker.git
    cd habit-tracker
    ```

2.  **Install Dependencies**
    Ensure you have Python installed. This project uses Flask.
    ```bash
    pip install flask
    ```

3.  **Run the Application**
    ```bash
    python app.py
    ```

4.  **Access the App**
    Open your browser and navigate to:
    `http://127.0.0.1:5000`

## 📂 Project Structure

```
habit-tracker/
├── app.py                 # Flask backend & Database logic
├── static/
│   ├── style.css         # Main styles
│   ├── style_analytics.css # Dashboard specific styles
│   ├── script.js         # Core frontend logic
│   ├── script_analytics.js # Dashboard logic
│   └── habits.db         # SQLite Database (auto-created)
├── templates/
│   ├── index.html        # Main tracker view
│   └── analytics.html    # Analytics dashboard
└── README.md
```

## 🤝 Contributing

Feel free to fork this project and submit pull requests. Suggestions for new features (like gamification or cloud sync) are welcome!

## 📄 License

This project is open-source and available under the MIT License.
