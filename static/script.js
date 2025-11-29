// Full frontend script (Optimized for SQLite + Optimistic UI)

let currentDate = new Date();
let selectedDate = null;
let currentWeekStart = null;
let currentMonthView = new Date();
let currentYear = new Date().getFullYear();

// Local state mirroring the DB
let habitData = {
    dailyTemplates: [],
    dailyCompletions: {},
    weekly: {},
    monthly: {},
    yearly: {}
};

// Utility: fetch JSON helper
async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, Object.assign({
        headers: { 'Content-Type': 'application/json' }
    }, opts));
    if (!res.ok) {
        const txt = await res.text();
        console.error('Fetch error', url, res.status, txt);
        throw new Error(txt || res.statusText);
    }
    return res.json();
}

document.addEventListener('DOMContentLoaded', async function () {
    try {
        await loadDataFromServer();
    } catch (e) {
        console.error('Failed to load data from server', e);
    }
    initializeCalendar();
    initializeWeekView();
    initializeMonthView();
    initializeYearView();
    populateYearDropdown();

    selectedDate = new Date();
    updateSelectedDate();
    renderDailyHabits();
});

// ========== Server sync ==========

async function loadDataFromServer() {
    const data = await fetchJSON('/api/data');
    habitData = data;
}

// NOTE: We no longer use a global "refreshFromServerAndRender" for every click.
// We only fetch all data on initial load.

// ========== Toggle level UI ==========

function toggleLevel(levelId) {
    const section = document.getElementById(levelId);
    section.classList.toggle('open');
}

// ========== Calendar (Daily) ==========

function initializeCalendar() {
    renderCalendar();
    updateCalendarHeader();
}

function updateCalendarHeader() {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('currentMonthYear').textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
}

function renderCalendar() {
    const calendar = document.getElementById('calendar');
    if (!calendar) return;
    calendar.innerHTML = '';

    // Day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const dayElement = document.createElement('div');
        dayElement.className = 'day-header';
        dayElement.textContent = day;
        calendar.appendChild(dayElement);
    });

    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const prevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        const dayElement = createCalendarDay(prevMonth.getDate() - i, true);
        calendar.appendChild(dayElement);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = createCalendarDay(day, false);
        calendar.appendChild(dayElement);
    }

    const totalCells = 42;
    const cellsUsed = startingDayOfWeek + daysInMonth;
    for (let day = 1; cellsUsed + day - 1 < totalCells; day++) {
        const dayElement = createCalendarDay(day, true);
        calendar.appendChild(dayElement);
    }
}

function createCalendarDay(day, isOtherMonth) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    dayElement.textContent = day;

    if (isOtherMonth) {
        dayElement.classList.add('other-month');
    } else {
        const today = new Date();
        const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);

        if (dayDate.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        }

        if (selectedDate && dayDate.toDateString() === selectedDate.toDateString()) {
            dayElement.classList.add('selected');
        }

        dayElement.onclick = () => selectDate(dayDate);
    }

    return dayElement;
}

function selectDate(date) {
    selectedDate = date;
    updateSelectedDate();
    renderCalendar();
    renderDailyHabits();
}

function updateSelectedDate() {
    const dateTitle = document.getElementById('selectedDateTitle');
    if (selectedDate) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateTitle.textContent = `${selectedDate.toLocaleDateString('en-US', options)}`;
    }
}

function changeMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar();
    updateCalendarHeader();
}

// ========== Daily habits ==========

function renderDailyHabits() {
    const habitsList = document.getElementById('dailyHabitsList');
    habitsList.innerHTML = '';

    if (!selectedDate) return;

    const dateKey = formatDateKey(selectedDate);
    const completionsRaw = habitData.dailyCompletions || {};
    const completions = completionsRaw[dateKey] || {};

    habitData.dailyTemplates.forEach(template => {
        const start = new Date(template.startDate);
        const end = template.endDate ? new Date(template.endDate) : null;

        // Normalize both sides to midnight
        const selOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endOnly = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate()) : null;

        if (selOnly < startOnly) return; // too early
        if (endOnly && selOnly > endOnly) return; // ended

        const idStr = String(template.id);
        const completed = completions[idStr] === true || completions[template.id] === true;
        const habitElement = createDailyHabitElement(template, dateKey, completed);
        habitsList.appendChild(habitElement);
    });


    if (habitData.dailyTemplates.length === 0) {
        const noHabitsMsg = document.createElement('div');
        noHabitsMsg.className = 'no-habits-message';
        noHabitsMsg.style.cssText = 'text-align: center; color: #64748b; font-style: italic; padding: 20px;';
        noHabitsMsg.textContent = 'No daily habits yet. Add your first habit above!';
        habitsList.appendChild(noHabitsMsg);
    }

    // update progress
    const percent = computeDailyProgress(dateKey);
    updateLevelProgress('daily', percent);
}

function createDailyHabitElement(template, dateKey, completed) {
    const habitElement = document.createElement('div');
    habitElement.className = 'habit-item';

    habitElement.innerHTML = `
        <div class="habit-left">
            <input type="checkbox" class="habit-checkbox" ${completed ? 'checked' : ''} 
                   onchange="onToggleDaily('${dateKey}', ${template.id}, this)">
            <span class="habit-name ${completed ? 'completed' : ''}">${escapeHtml(template.name)}</span>
        </div>
        <button class="delete-btn" onclick="onDeleteDailyTemplate(${template.id})" title="Delete this habit permanently">Delete</button>
    `;

    return habitElement;
}

function escapeHtml(unsafe) {
    return unsafe.replace(/[&<"'>]/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" })[m];
    });
}

// OPTIMISTIC UI TOGGLE
async function onToggleDaily(dateKey, templateId, checkbox) {
    const isChecked = checkbox.checked;
    const key = String(templateId);

    // 1. Update Local State immediately
    if (!habitData.dailyCompletions[dateKey]) {
        habitData.dailyCompletions[dateKey] = {};
    }
    habitData.dailyCompletions[dateKey][key] = isChecked;

    // 2. Update UI (Progress bar & Text strikethrough)
    const span = checkbox.nextElementSibling;
    if (isChecked) span.classList.add('completed');
    else span.classList.remove('completed');

    const percent = computeDailyProgress(dateKey);
    updateLevelProgress('daily', percent);

    // 3. Send Request in Background
    try {
        await fetchJSON('/api/daily/toggle', {
            method: 'POST',
            body: JSON.stringify({ dateKey, templateId })
        });
        // Success! No need to do anything else.
    } catch (e) {
        console.error('Failed toggling daily', e);
        // Revert on failure
        checkbox.checked = !isChecked;
        habitData.dailyCompletions[dateKey][key] = !isChecked;
        if (!isChecked) span.classList.add('completed');
        else span.classList.remove('completed');
        updateLevelProgress('daily', computeDailyProgress(dateKey));
        alert("Failed to save change. Please check your connection.");
    }
}

async function onDeleteDailyTemplate(templateId) {
    if (!confirm('Are you sure you want to delete this habit? This will remove it from all dates.')) return;
    try {
        await fetch(`/api/daily/template/${templateId}`, { method: 'DELETE' });

        // Update local state: Soft delete (set endDate to today) or remove if we want immediate disappearance
        // The backend does a soft delete (sets endDate). 
        // For the UI to update correctly without refetching, we should find the template and set its endDate.
        const todayStr = new Date().toISOString().split('T')[0];
        const t = habitData.dailyTemplates.find(t => t.id === templateId);
        if (t) {
            t.endDate = todayStr;
        }

        // Re-render only daily section
        renderDailyHabits();
    } catch (e) {
        console.error('Failed deleting template', e);
    }
}

// ========== Weekly ==========

function initializeWeekView() {
    currentWeekStart = getWeekStart(new Date());
    updateWeekTitle();
    renderWeeklyHabits();
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
}

function updateWeekTitle() {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const options = { month: 'short', day: 'numeric' };
    const startStr = currentWeekStart.toLocaleDateString('en-US', options);
    const endStr = weekEnd.toLocaleDateString('en-US', options);
    document.getElementById('currentWeekTitle').textContent = `Week: ${startStr} - ${endStr}`;
}

function changeWeek(direction) {
    currentWeekStart.setDate(currentWeekStart.getDate() + (direction * 7));
    updateWeekTitle();
    renderWeeklyHabits();
}

function selectWeekDate() {
    const datePicker = document.getElementById('weekDatePicker');
    if (datePicker.value) {
        const selected = new Date(datePicker.value);
        currentWeekStart = getWeekStart(selected);
        updateWeekTitle();
        renderWeeklyHabits();
    }
}

function getWeekKey(date) {
    const year = date.getFullYear();
    const week = getWeekNumber(date);
    return `${year}-W${week}`;
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function renderWeeklyHabits() {
    const habitsList = document.getElementById('weeklyHabitsList');
    habitsList.innerHTML = '';

    const weekKey = getWeekKey(currentWeekStart);
    const habits = (habitData.weekly && habitData.weekly[weekKey]) ? habitData.weekly[weekKey] : [];

    habits.forEach(habit => {
        const habitElement = createHabitElement(habit, 'weekly', weekKey);
        habitsList.appendChild(habitElement);
    });

    if (habits.length === 0) {
        const noHabitsMsg = document.createElement('div');
        noHabitsMsg.className = 'no-habits-message';
        noHabitsMsg.style.cssText = 'text-align: center; color: #64748b; font-style: italic; padding: 20px;';
        noHabitsMsg.textContent = 'No weekly habits for this week. Add one above!';
        habitsList.appendChild(noHabitsMsg);
    }

    // update progress
    const percent = computePeriodProgress('weekly', weekKey);
    updateLevelProgress('weekly', percent);
}

// ========== Monthly ==========

function initializeMonthView() {
    updateMonthTitle();
    renderMonthlyHabits();
}

function updateMonthTitle() {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('currentMonthTitle').textContent = `${monthNames[currentMonthView.getMonth()]} ${currentMonthView.getFullYear()}`;
}

function changeMonthView(direction) {
    currentMonthView.setMonth(currentMonthView.getMonth() + direction);
    updateMonthTitle();
    renderMonthlyHabits();
}

function getMonthKey(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
}

function renderMonthlyHabits() {
    const habitsList = document.getElementById('monthlyHabitsList');
    habitsList.innerHTML = '';

    const monthKey = getMonthKey(currentMonthView);
    const habits = (habitData.monthly && habitData.monthly[monthKey]) ? habitData.monthly[monthKey] : [];

    habits.forEach(habit => {
        const habitElement = createHabitElement(habit, 'monthly', monthKey);
        habitsList.appendChild(habitElement);
    });

    if (habits.length === 0) {
        const noHabitsMsg = document.createElement('div');
        noHabitsMsg.className = 'no-habits-message';
        noHabitsMsg.style.cssText = 'text-align: center; color: #64748b; font-style: italic; padding: 20px;';
        noHabitsMsg.textContent = 'No monthly habits for this month. Add one above!';
        habitsList.appendChild(noHabitsMsg);
    }

    // update progress
    const percent = computePeriodProgress('monthly', monthKey);
    updateLevelProgress('monthly', percent);
}

// ========== Yearly ==========

function initializeYearView() {
    updateYearTitle();
    renderYearlyHabits();
}

function updateYearTitle() {
    document.getElementById('currentYearTitle').textContent = `Year: ${currentYear}`;
}

function changeYear(direction) {
    currentYear += direction;
    updateYearTitle();
    renderYearlyHabits();
}

function selectYear() {
    const yearDropdown = document.getElementById('yearDropdown');
    if (yearDropdown.value) {
        currentYear = parseInt(yearDropdown.value);
        updateYearTitle();
        renderYearlyHabits();
    }
}

function populateYearDropdown() {
    const yearDropdown = document.getElementById('yearDropdown');
    const currentYearValue = new Date().getFullYear();
    const startYear = currentYearValue - 5;
    const endYear = currentYearValue + 5;

    yearDropdown.innerHTML = '';

    for (let year = startYear; year <= endYear; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) option.selected = true;
        yearDropdown.appendChild(option);
    }
}

function renderYearlyHabits() {
    const habitsList = document.getElementById('yearlyHabitsList');
    habitsList.innerHTML = '';

    const yearKey = currentYear.toString();
    const habits = (habitData.yearly && habitData.yearly[yearKey]) ? habitData.yearly[yearKey] : [];

    habits.forEach(habit => {
        const habitElement = createHabitElement(habit, 'yearly', yearKey);
        habitsList.appendChild(habitElement);
    });

    if (habits.length === 0) {
        const noHabitsMsg = document.createElement('div');
        noHabitsMsg.className = 'no-habits-message';
        noHabitsMsg.style.cssText = 'text-align: center; color: #64748b; font-style: italic; padding: 20px;';
        noHabitsMsg.textContent = 'No yearly habits for this year. Add one above!';
        habitsList.appendChild(noHabitsMsg);
    }

    // update progress
    const percent = computePeriodProgress('yearly', yearKey);
    updateLevelProgress('yearly', percent);
}

// ========== Generic habit functions (add/toggle/delete) ==========

async function addHabit(type) {
    const inputId = `${type}HabitInput`;
    const input = document.getElementById(inputId);
    const habitName = input.value.trim();
    if (!habitName) return;

    if (type === 'daily') {
        // Prevent past-date additions
        if (selectedDate) {
            const today = new Date();
            const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const selOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
            if (selOnly < todayOnly) {
                alert("❌ You cannot create a habit in the past!");
                return;
            }
        }

        try {
            const newTemplate = await fetchJSON('/api/daily/template', {
                method: 'POST',
                body: JSON.stringify({ name: habitName })
            });
            input.value = '';

            // Update local state
            habitData.dailyTemplates.push(newTemplate);
            renderDailyHabits();
        } catch (e) {
            console.error('Failed adding daily template', e);
        }
        return;
    }

    let key;
    switch (type) {
        case 'weekly':
            key = getWeekKey(currentWeekStart);
            break;
        case 'monthly':
            key = getMonthKey(currentMonthView);
            break;
        case 'yearly':
            key = currentYear.toString();
            break;
        default:
            return;
    }

    try {
        const newHabit = await fetchJSON(`/api/${type}/add`, {
            method: 'POST',
            body: JSON.stringify({ key, name: habitName })
        });
        input.value = '';

        // Update local state
        if (!habitData[type]) habitData[type] = {};
        if (!habitData[type][key]) habitData[type][key] = [];
        habitData[type][key].push(newHabit);

        renderHabits(type);
    } catch (e) {
        console.error('Failed adding habit', e);
    }
}

function renderHabits(type) {
    switch (type) {
        case 'daily': renderDailyHabits(); break;
        case 'weekly': renderWeeklyHabits(); break;
        case 'monthly': renderMonthlyHabits(); break;
        case 'yearly': renderYearlyHabits(); break;
    }
}

function createHabitElement(habit, type, key) {
    const habitElement = document.createElement('div');
    habitElement.className = 'habit-item';

    habitElement.innerHTML = `
        <div class="habit-left">
            <input type="checkbox" class="habit-checkbox" ${habit.completed ? 'checked' : ''} 
                   onchange="onToggleHabit('${type}', '${key}', ${habit.id}, this)">
            <span class="habit-name ${habit.completed ? 'completed' : ''}">${escapeHtml(habit.name)}</span>
        </div>
        <button class="delete-btn" onclick="onDeleteHabit('${type}', '${key}', ${habit.id})">Delete</button>
    `;

    return habitElement;
}

// OPTIMISTIC TOGGLE for Period Habits
async function onToggleHabit(type, key, habitId, checkbox) {
    const isChecked = checkbox.checked;

    // 1. Update Local State
    const habits = habitData[type][key];
    const habit = habits.find(h => h.id === habitId);
    if (habit) {
        habit.completed = isChecked;
    }

    // 2. Update UI
    const span = checkbox.nextElementSibling;
    if (isChecked) span.classList.add('completed');
    else span.classList.remove('completed');

    const percent = computePeriodProgress(type, key);
    updateLevelProgress(type, percent);

    // 3. Send Request
    try {
        await fetchJSON(`/api/${type}/toggle`, {
            method: 'POST',
            body: JSON.stringify({ key, id: habitId })
        });
    } catch (e) {
        console.error(`Failed toggling ${type} habit`, e);
        // Revert
        checkbox.checked = !isChecked;
        if (habit) habit.completed = !isChecked;
        if (!isChecked) span.classList.add('completed');
        else span.classList.remove('completed');
        updateLevelProgress(type, computePeriodProgress(type, key));
        alert("Failed to save change.");
    }
}

async function onDeleteHabit(type, key, habitId) {
    if (!confirm('Are you sure you want to delete this habit?')) return;
    try {
        await fetchJSON(`/api/${type}/delete`, {
            method: 'POST',
            body: JSON.stringify({ key, id: habitId })
        });

        // Update local state
        if (habitData[type] && habitData[type][key]) {
            habitData[type][key] = habitData[type][key].filter(h => h.id !== habitId);
        }
        renderHabits(type);
    } catch (e) {
        console.error(`Failed deleting ${type} habit`, e);
    }
}

// ========== Utilities ==========

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// allow Enter to add
document.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        const target = e.target;
        if (target.id === 'dailyHabitInput') addHabit('daily');
        else if (target.id === 'weeklyHabitInput') addHabit('weekly');
        else if (target.id === 'monthlyHabitInput') addHabit('monthly');
        else if (target.id === 'yearlyHabitInput') addHabit('yearly');
    }
});

// ========== Analysis (server-backed) ==========

async function fetchAnalysis(scope) {
    const year = new Date().getFullYear();
    try {
        const res = await fetchJSON(`/api/analysis?scope=${encodeURIComponent(scope)}&year=${year}`);
        document.getElementById('analysisResult').innerHTML = `
            <p><b>${scope.toUpperCase()} Analysis (${year})</b></p>
            <p>Completion Rate: ${res.completionRate}%</p>
        `;
    } catch (e) {
        console.error('Failed fetching analysis', e);
    }
}

// ========== Progress UI injection & helpers ==========

function computeDailyProgress(dateKey) {
    const templates = habitData.dailyTemplates || [];
    const total = templates.length;
    if (total === 0) return 0;
    const completions = habitData.dailyCompletions && habitData.dailyCompletions[dateKey] ? habitData.dailyCompletions[dateKey] : {};
    let completed = 0;
    templates.forEach(t => {
        const key = String(t.id);
        if (completions[key] === true || completions[t.id] === true) completed++;
    });
    return Math.round((completed / total) * 100);
}

function computePeriodProgress(period, key) {
    const bucket = (habitData[period] && habitData[period][key]) ? habitData[period][key] : [];
    const total = bucket.length;
    if (total === 0) return 0;
    let completed = bucket.reduce((acc, h) => acc + (h.completed ? 1 : 0), 0);
    return Math.round((completed / total) * 100);
}

// Create or update progress UI under each level
function updateLevelProgress(level, percent) {
    // mapping level -> section id
    const map = {
        daily: 'level1',
        weekly: 'level2',
        monthly: 'level3',
        yearly: 'level4'
    };
    const sectionId = map[level];
    if (!sectionId) return;
    const section = document.getElementById(sectionId);
    if (!section) return;

    // find level-content to place progress (top)
    const content = section.querySelector('.level-content');
    if (!content) return;

    // Ensure a container exists
    let progressContainer = content.querySelector(`.level-progress[data-level="${level}"]`);
    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.className = 'level-progress';
        progressContainer.setAttribute('data-level', level);
        // minimal inline style so it fits design without editing CSS
        progressContainer.style.cssText = 'margin-bottom:12px; display:flex; align-items:center; gap:12px;';
        // insert as first child of level-content, so it's below header visually
        content.insertBefore(progressContainer, content.firstChild);
    }

    progressContainer.innerHTML = `
        <div style="flex:1; display:flex; align-items:center; gap:12px;">
            <progress value="${percent}" max="100" style="width:100%; height:14px; appearance:auto;"></progress>
            <span style="min-width:78px; font-weight:600; color:#fff;">${percent}%</span>
        </div>
    `;
}

// ========== wrappers used by inline HTML event handlers ==========
// These are now updated to pass 'this' (the checkbox) and use the new logic

window.onToggleDaily = onToggleDaily;
window.onDeleteDailyTemplate = onDeleteDailyTemplate;
window.onToggleHabit = onToggleHabit;
window.onDeleteHabit = onDeleteHabit;

// Small safety: ensure progress is present on initial load for all sections
setTimeout(() => {
    try {
        // compute visible keys and update progress
        const dKey = formatDateKey(selectedDate || new Date());
        updateLevelProgress('daily', computeDailyProgress(dKey));
        updateLevelProgress('weekly', computePeriodProgress('weekly', getWeekKey(currentWeekStart || new Date())));
        updateLevelProgress('monthly', computePeriodProgress('monthly', getMonthKey(currentMonthView || new Date())));
        updateLevelProgress('yearly', computePeriodProgress('yearly', (currentYear || new Date().getFullYear()).toString()));
    } catch (e) {
        // ignore if not yet initialized
    }
}, 800);
