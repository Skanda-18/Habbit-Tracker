from flask import Flask, request, jsonify, render_template, g
import os
import sqlite3
import json
from datetime import date, datetime

# Configure Flask with proper folders
app = Flask(__name__, static_folder="static", template_folder="templates")

# Path to database
DB_FILE = os.path.join(app.static_folder, "habits.db")

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DB_FILE)
        db.row_factory = sqlite3.Row  # Access columns by name
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        # Ensure tables exist (same as migration script, just in case)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS daily_templates (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                start_date TEXT,
                end_date TEXT
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS daily_completions (
                date_key TEXT NOT NULL,
                template_id INTEGER NOT NULL,
                completed BOOLEAN NOT NULL CHECK (completed IN (0, 1)),
                PRIMARY KEY (date_key, template_id),
                FOREIGN KEY(template_id) REFERENCES daily_templates(id)
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS period_habits (
                id INTEGER PRIMARY KEY,
                period_type TEXT NOT NULL,
                period_key TEXT NOT NULL,
                name TEXT NOT NULL,
                completed BOOLEAN NOT NULL CHECK (completed IN (0, 1))
            )
        ''')
        db.commit()

def make_id():
    import time
    return int(time.time() * 1000)

# ---------- Page routes ----------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/analytics")
def analytics():
    return render_template("analytics.html")

# ---------- API routes ----------
@app.route("/api/data", methods=["GET"])
def api_get_data():
    db = get_db()
    cursor = db.cursor()

    # 1. Daily Templates
    cursor.execute("SELECT * FROM daily_templates")
    templates = []
    for row in cursor.fetchall():
        templates.append({
            "id": row["id"],
            "name": row["name"],
            "startDate": row["start_date"],
            "endDate": row["end_date"]
        })

    # 2. Daily Completions
    # Structure: {"YYYY-MM-DD": {"templateId": true, ...}}
    cursor.execute("SELECT * FROM daily_completions WHERE completed = 1")
    completions = {}
    for row in cursor.fetchall():
        d_key = row["date_key"]
        t_id = str(row["template_id"]) # JS expects string keys often, or we can use int
        if d_key not in completions:
            completions[d_key] = {}
        completions[d_key][t_id] = True

    # 3. Period Habits (Weekly, Monthly, Yearly)
    cursor.execute("SELECT * FROM period_habits")
    weekly = {}
    monthly = {}
    yearly = {}
    
    for row in cursor.fetchall():
        p_type = row["period_type"]
        p_key = row["period_key"]
        habit = {
            "id": row["id"],
            "name": row["name"],
            "completed": bool(row["completed"])
        }
        
        target_dict = None
        if p_type == "weekly": target_dict = weekly
        elif p_type == "monthly": target_dict = monthly
        elif p_type == "yearly": target_dict = yearly
        
        if target_dict is not None:
            if p_key not in target_dict:
                target_dict[p_key] = []
            target_dict[p_key].append(habit)

    return jsonify({
        "dailyTemplates": templates,
        "dailyCompletions": completions,
        "weekly": weekly,
        "monthly": monthly,
        "yearly": yearly
    })

@app.route("/api/daily/template", methods=["POST"])
def api_add_daily_template():
    payload = request.get_json(force=True)
    name = payload.get("name", "").strip()
    if not name:
        return jsonify({"error": "Missing name"}), 400

    # Optional startDate validation
    requested_date = payload.get("startDate")
    today = date.today().strftime("%Y-%m-%d")
    if requested_date:
        try:
            req = datetime.strptime(requested_date, "%Y-%m-%d").date()
            now = date.today()
            if req < now:
                return jsonify({"error": "Cannot create a habit in the past!"}), 400
        except Exception:
            return jsonify({"error": "Invalid date format"}), 400

    new_id = make_id()
    db = get_db()
    db.execute(
        "INSERT INTO daily_templates (id, name, start_date, end_date) VALUES (?, ?, ?, ?)",
        (new_id, name, today, None)
    )
    db.commit()
    
    return jsonify({
        "id": new_id,
        "name": name,
        "startDate": today,
        "endDate": None
    }), 201

@app.route("/api/daily/template/<int:template_id>", methods=["DELETE"])
def api_delete_daily_template(template_id):
    db = get_db()
    today = date.today().strftime("%Y-%m-%d")
    # Soft delete by setting endDate
    db.execute(
        "UPDATE daily_templates SET end_date = ? WHERE id = ? AND end_date IS NULL",
        (today, template_id)
    )
    db.commit()
    return jsonify({"ok": True})

@app.route("/api/daily/toggle", methods=["POST"])
def api_toggle_daily():
    payload = request.get_json(force=True)
    dateKey = payload.get("dateKey")
    templateId = payload.get("templateId")
    if not dateKey or templateId is None:
        return jsonify({"error": "Missing dateKey or templateId"}), 400

    db = get_db()
    # Check current state
    cur = db.execute(
        "SELECT completed FROM daily_completions WHERE date_key = ? AND template_id = ?",
        (dateKey, templateId)
    )
    row = cur.fetchone()
    
    new_state = True
    if row:
        new_state = not bool(row["completed"])
        db.execute(
            "UPDATE daily_completions SET completed = ? WHERE date_key = ? AND template_id = ?",
            (1 if new_state else 0, dateKey, templateId)
        )
    else:
        # Insert new
        db.execute(
            "INSERT INTO daily_completions (date_key, template_id, completed) VALUES (?, ?, ?)",
            (dateKey, templateId, 1)
        )
    
    db.commit()
    return jsonify({
        "dateKey": dateKey,
        "templateId": templateId,
        "completed": new_state,
    })

@app.route("/api/<period>/add", methods=["POST"])
def api_add_period(period):
    if period not in ("weekly", "monthly", "yearly"):
        return jsonify({"error": "Invalid period"}), 400
    payload = request.get_json(force=True)
    key = payload.get("key")
    name = (payload.get("name") or "").strip()
    if not key or not name:
        return jsonify({"error": "Missing key or name"}), 400
    
    new_id = make_id()
    db = get_db()
    db.execute(
        "INSERT INTO period_habits (id, period_type, period_key, name, completed) VALUES (?, ?, ?, ?, ?)",
        (new_id, period, key, name, 0)
    )
    db.commit()
    
    return jsonify({"id": new_id, "name": name, "completed": False}), 201

@app.route("/api/<period>/toggle", methods=["POST"])
def api_toggle_period(period):
    if period not in ("weekly", "monthly", "yearly"):
        return jsonify({"error": "Invalid period"}), 400
    payload = request.get_json(force=True)
    key = payload.get("key")
    habitId = payload.get("id")
    if key is None or habitId is None:
        return jsonify({"error": "Missing key or id"}), 400
    
    db = get_db()
    cur = db.execute("SELECT completed, name FROM period_habits WHERE id = ?", (habitId,))
    row = cur.fetchone()
    if not row:
        return jsonify({"error": "Habit not found"}), 404
    
    new_state = not bool(row["completed"])
    db.execute("UPDATE period_habits SET completed = ? WHERE id = ?", (1 if new_state else 0, habitId))
    db.commit()
    
    return jsonify({"ok": True, "habit": {"id": habitId, "name": row["name"], "completed": new_state}})

@app.route("/api/<period>/delete", methods=["POST"])
def api_delete_period(period):
    if period not in ("weekly", "monthly", "yearly"):
        return jsonify({"error": "Invalid period"}), 400
    payload = request.get_json(force=True)
    habitId = payload.get("id")
    if habitId is None:
        return jsonify({"error": "Missing id"}), 400
    
    db = get_db()
    db.execute("DELETE FROM period_habits WHERE id = ?", (habitId,))
    db.commit()
    return jsonify({"ok": True})

@app.route("/api/analysis", methods=["GET"])
def api_analysis():
    scope = request.args.get("scope", "daily")
    year = request.args.get("year", None)
    
    db = get_db()
    total = 0
    completed = 0
    
    if scope == "daily":
        # This is a bit complex in SQL to replicate exact JSON logic without more structure
        # JSON logic: iterate all completions, check if year matches.
        # We also need to know total possible habits? 
        # The original code just counted "total += 1" for every entry in dailyCompletions.
        # Wait, the original code:
        # for dateKey, completions in data.get("dailyCompletions", {}).items():
        #     for val in completions.values():
        #         total += 1
        #         if val: completed += 1
        # It only counted *recorded* completions (true or false). It didn't count "potential" habits.
        # So we can just query daily_completions table.
        
        query = "SELECT completed FROM daily_completions"
        params = []
        if year:
            query += " WHERE date_key LIKE ?"
            params.append(f"{year}%")
        
        cursor = db.execute(query, params)
        rows = cursor.fetchall()
        total = len(rows)
        completed = sum(1 for r in rows if r["completed"])
        
    elif scope in ("weekly", "monthly"):
        # Original logic: iterate weekly/monthly dicts.
        # We query period_habits
        query = "SELECT completed FROM period_habits WHERE period_type = ?"
        params = [scope]
        if year:
            # Weekly keys: "2023-W01", Monthly: "2023-01"
            # Both start with year
            query += " AND period_key LIKE ?"
            params.append(f"{year}%")
            
        cursor = db.execute(query, params)
        rows = cursor.fetchall()
        total = len(rows)
        completed = sum(1 for r in rows if r["completed"])

    else:
        return jsonify({"error": "Invalid scope"}), 400

    completionRate = int(round((completed / total) * 100)) if total > 0 else 0
    return jsonify({
        "scope": scope,
        "year": year,
        "totalHabits": total,
        "completedHabits": completed,
        "completionRate": completionRate,
    })

if __name__ == "__main__":
    init_db()
    print("Starting Flask app with SQLite. Open http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
