// script_analytics.js - Premium Analytics Logic

// Config
const API_URL = "/api/data";
const STREAK_THRESHOLD_PERCENT = 50;

// State
let rawData = null;
let charts = {
    daily: null,
    weekly: null,
    monthly: null,
    yearly: null
};

// DOM Elements
const els = {
    viewSelector: document.getElementById('viewSelector'),
    dateControl: document.getElementById('dateControl'),
    monthControl: document.getElementById('monthControl'),
    yearControl: document.getElementById('yearControl'),
    selectedDate: document.getElementById('selectedDate'),
    selectedMonth: document.getElementById('selectedMonth'),
    selectedYear: document.getElementById('selectedYear'),
    refreshBtn: document.getElementById('refreshBtn'),
    downloadBtn: document.getElementById('downloadSnapshot'),
    toggles: {
        daily: document.getElementById('showDaily'),
        weekly: document.getElementById('showWeekly'),
        monthly: document.getElementById('showMonthly'),
        yearly: document.getElementById('showYearly')
    },
    cards: {
        daily: document.getElementById('dailyChartCard'),
        weekly: document.getElementById('weeklyChartCard'),
        monthly: document.getElementById('monthlyChartCard'),
        yearly: document.getElementById('yearlyChartCard')
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    populateYears();
    computeDefaultSelections();
    updateControlsVisibility();

    await loadData();
});

function setupEventListeners() {
    els.refreshBtn.addEventListener('click', async () => {
        els.refreshBtn.classList.add('spinning');
        await loadData();
        setTimeout(() => els.refreshBtn.classList.remove('spinning'), 500);
    });

    els.downloadBtn.addEventListener('click', downloadReport);

    els.viewSelector.addEventListener('change', () => {
        updateControlsVisibility();
        renderAll();
    });

    [els.selectedDate, els.selectedMonth, els.selectedYear].forEach(el => {
        el.addEventListener('change', renderAll);
    });

    // Chart Toggles
    Object.keys(els.toggles).forEach(key => {
        els.toggles[key].addEventListener('change', () => {
            const isVisible = els.toggles[key].checked;
            els.cards[key].style.display = isVisible ? 'block' : 'none';
            // Trigger resize to fix chart dimensions if hidden/shown
            if (isVisible && charts[key]) charts[key].resize();
        });
    });
}

function updateControlsVisibility() {
    const mode = els.viewSelector.value;
    els.dateControl.style.display = (mode === 'daily' || mode === 'weekly') ? 'block' : 'none';
    els.monthControl.style.display = (mode === 'month') ? 'block' : 'none';
    els.yearControl.style.display = (mode === 'monthly' || mode === 'yearly') ? 'block' : 'none';
}

function populateYears() {
    const current = new Date().getFullYear();
    for (let y = current - 5; y <= current + 2; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === current) opt.selected = true;
        els.selectedYear.appendChild(opt);
    }
}

function computeDefaultSelections() {
    const now = new Date();
    els.selectedDate.value = formatDateInput(now);
    els.selectedMonth.value = getMonthInputValue(now);
}

// Data Loading
async function loadData() {
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error('Failed to fetch data');
        rawData = await res.json();
        renderAll();
    } catch (e) {
        console.error(e);
        alert("Error loading data. Please check console.");
    }
}

// Rendering
function renderAll() {
    if (!rawData) return;

    // 1. Update Titles
    updateHeader();

    // 2. Update KPIs
    updateKPIs();

    // 3. Render Charts
    if (els.toggles.daily.checked) renderDailyChart();
    if (els.toggles.weekly.checked) renderWeeklyChart();
    if (els.toggles.monthly.checked) renderMonthlyChart();
    if (els.toggles.yearly.checked) renderYearlyChart();

    // 4. Render Table
    renderTable();
}

function updateHeader() {
    const mode = els.viewSelector.value;
    let title = "Dashboard";
    let sub = "Overview";

    if (mode === 'month') {
        const m = els.selectedMonth.value;
        title = formatMonthDisplay(m);
        sub = "Daily & Weekly Progress";
    } else if (mode === 'daily') {
        title = formatFriendlyDate(els.selectedDate.value);
        sub = "Daily Breakdown";
    } else if (mode === 'weekly') {
        title = "Weekly Overview";
        sub = `Week of ${els.selectedDate.value}`;
    } else {
        title = `Year ${els.selectedYear.value}`;
        sub = "Long-term Trends";
    }

    document.getElementById('mainTitle').textContent = title;
    document.getElementById('subTitle').textContent = sub;
}

function updateKPIs() {
    // Today's %
    const todayPercent = computeTodayPercent();
    document.getElementById('todayPercentLarge').textContent = `${Math.round(todayPercent)}%`;
    document.getElementById('todayText').textContent = getMotivationText(todayPercent);

    // Streak
    const { current, longest } = computeStreaks();
    document.getElementById('streakNumber').textContent = `${current} Days`;
    document.getElementById('streakText').textContent = `Longest: ${longest} Days`;

    // Monthly Avg
    const avg = computeMonthlyAverage();
    document.getElementById('monthlyAvgFill').style.width = `${avg}%`;
    document.getElementById('monthlyAvgText').textContent = `${avg.toFixed(1)}% Average`;
}

// Chart Rendering Helpers
function createGradient(ctx, colorStart, colorEnd) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, colorStart);
    gradient.addColorStop(1, colorEnd);
    return gradient;
}

const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(24, 24, 27, 0.9)',
            titleColor: '#fff',
            bodyColor: '#a1a1aa',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
        }
    },
    scales: {
        y: {
            beginAtZero: true,
            max: 100,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#71717a' }
        },
        x: {
            grid: { display: false },
            ticks: { color: '#71717a' }
        }
    }
};

function renderDailyChart() {
    const ctx = document.getElementById('dailyLineChart').getContext('2d');
    const month = els.selectedMonth.value || getMonthInputValue(new Date());
    const days = getDaysInMonth(month);

    const labels = days.map(d => parseDateOnly(d).getDate());
    const data = days.map(d => Math.round(computePercentForDate(d) || 0));

    if (charts.daily) charts.daily.destroy();

    const gradient = createGradient(ctx, 'rgba(16, 185, 129, 0.5)', 'rgba(16, 185, 129, 0.0)');

    charts.daily = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data,
                borderColor: '#10b981',
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6
            }]
        },
        options: commonOptions
    });
}

function renderWeeklyChart() {
    const ctx = document.getElementById('weeklyBarChart').getContext('2d');
    const month = els.selectedMonth.value || getMonthInputValue(new Date());
    const weeks = getWeekKeysForMonth(month);

    const labels = weeks.map(w => `W${w.weekKey.split('-W')[1]}`);
    const data = weeks.map(w => Math.round(computePercentForWeekKey(w.weekKey)));

    if (charts.weekly) charts.weekly.destroy();

    charts.weekly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: '#10b981',
                borderRadius: 4
            }]
        },
        options: commonOptions
    });
}

function renderMonthlyChart() {
    const ctx = document.getElementById('monthlyBarChart').getContext('2d');
    const year = els.selectedYear.value;

    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = [];
    for (let m = 0; m < 12; m++) {
        const key = `${year}-${String(m + 1).padStart(2, '0')}`;
        const days = getDaysInMonth(key);
        const percents = days.map(d => computePercentForDate(d)).filter(p => p !== null);
        const avg = percents.length ? (percents.reduce((a, b) => a + b, 0) / percents.length) : 0;
        data.push(Math.round(avg));
    }

    if (charts.monthly) charts.monthly.destroy();

    charts.monthly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: commonOptions
    });
}

function renderYearlyChart() {
    const ctx = document.getElementById('yearlyBarChart').getContext('2d');
    const year = els.selectedYear.value;
    // Reusing monthly data logic but displaying as line
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = [];
    for (let m = 0; m < 12; m++) {
        const key = `${year}-${String(m + 1).padStart(2, '0')}`;
        const days = getDaysInMonth(key);
        const percents = days.map(d => computePercentForDate(d)).filter(p => p !== null);
        const avg = percents.length ? (percents.reduce((a, b) => a + b, 0) / percents.length) : 0;
        data.push(Math.round(avg));
    }

    if (charts.yearly) charts.yearly.destroy();

    const gradient = createGradient(ctx, 'rgba(59, 130, 246, 0.5)', 'rgba(59, 130, 246, 0.0)');

    charts.yearly = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data,
                borderColor: '#3b82f6',
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointRadius: 3
            }]
        },
        options: commonOptions
    });
}

function renderTable() {
    const wrap = document.getElementById('dayTableWrap');
    wrap.innerHTML = '';

    // Default to showing days of selected month
    const month = els.selectedMonth.value || getMonthInputValue(new Date());
    const days = getDaysInMonth(month);

    days.forEach(d => {
        const div = document.createElement('div');
        div.className = 'day-row';

        const percent = computePercentForDate(d);
        const pText = percent === null ? '-' : `${Math.round(percent)}%`;
        const dateObj = parseDateOnly(d);

        div.innerHTML = `
            <div class="label">${dateObj.getDate()} ${dateObj.toLocaleString('default', { weekday: 'short' })}</div>
            <div class="muted" style="color: ${getColorForPercent(percent)}">${pText}</div>
        `;
        wrap.appendChild(div);
    });
}

// Utilities
function getColorForPercent(p) {
    if (p === null) return '#52525b';
    if (p >= 80) return '#10b981';
    if (p >= 50) return '#f59e0b';
    return '#ef4444';
}

function getMotivationText(p) {
    if (p >= 100) return "Perfect! You're crushing it! 🚀";
    if (p >= 80) return "Great job! Almost perfect. 🔥";
    if (p >= 50) return "Good effort. Keep pushing! 💪";
    return "Let's get back on track. 🌱";
}

function downloadReport() {
    if (!rawData) return;
    const blob = new Blob([JSON.stringify(rawData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habit-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

// --- Logic from previous script (retained & cleaned) ---
function computeTodayPercent() {
    return computePercentForDate(formatDateInput(new Date())) || 0;
}

function computePercentForDate(dateStr) {
    const templates = rawData.dailyTemplates || [];
    const comps = rawData.dailyCompletions || {};
    const dateComps = comps[dateStr] || {};
    let total = 0, completed = 0;

    const d = parseDateOnly(dateStr);
    for (const t of templates) {
        const start = t.startDate ? parseDateOnly(t.startDate) : null;
        const end = t.endDate ? parseDateOnly(t.endDate) : null;
        if (start && d < start) continue;
        if (end && d > end) continue;
        total++;
        if (dateComps[String(t.id)]) completed++;
    }
    return total === 0 ? null : (completed / total) * 100;
}

function computeMonthlyAverage() {
    const month = els.selectedMonth.value || getMonthInputValue(new Date());
    const days = getDaysInMonth(month);
    const percents = days.map(d => computePercentForDate(d)).filter(p => p !== null);
    if (!percents.length) return 0;
    return percents.reduce((a, b) => a + b, 0) / percents.length;
}

function computeStreaks() {
    // Simplified streak logic
    const comps = rawData.dailyCompletions || {};
    const dates = Object.keys(comps).sort();
    if (!dates.length) return { current: 0, longest: 0 };

    let current = 0, longest = 0, run = 0;

    // Calculate longest
    dates.forEach(d => {
        const p = computePercentForDate(d);
        if (p >= STREAK_THRESHOLD_PERCENT) {
            run++;
            if (run > longest) longest = run;
        } else {
            run = 0;
        }
    });

    // Calculate current (backwards from today)
    let d = new Date();
    while (true) {
        const ds = formatDateInput(d);
        const p = computePercentForDate(ds);
        if (p !== null && p >= STREAK_THRESHOLD_PERCENT) {
            current++;
            d.setDate(d.getDate() - 1);
        } else {
            break;
        }
    }
    return { current, longest };
}

// Date Helpers
function formatDateInput(date) {
    return date.toISOString().split('T')[0];
}
function getMonthInputValue(date) {
    return date.toISOString().slice(0, 7);
}
function parseDateOnly(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}
function formatFriendlyDate(str) {
    return parseDateOnly(str).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function formatMonthDisplay(str) {
    const [y, m] = str.split('-');
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function getDaysInMonth(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    const days = [];
    while (date.getMonth() === m - 1) {
        days.push(formatDateInput(date));
        date.setDate(date.getDate() + 1);
    }
    return days;
}
function getWeekKeysForMonth(monthStr) {
    // Reuse logic or simplified
    const days = getDaysInMonth(monthStr);
    const weeks = new Set();
    const res = [];
    days.forEach(d => {
        const date = parseDateOnly(d);
        const wk = getWeekKey(date);
        if (!weeks.has(wk)) {
            weeks.add(wk);
            res.push({ weekKey: wk });
        }
    });
    return res;
}
function getWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${date.getFullYear()}-W${weekNo}`;
}
function computePercentForWeekKey(weekKey) {
    const bucket = rawData.weekly && rawData.weekly[weekKey] ? rawData.weekly[weekKey] : [];
    if (!bucket.length) return 0;
    const completed = bucket.filter(h => h.completed).length;
    return (completed / bucket.length) * 100;
}