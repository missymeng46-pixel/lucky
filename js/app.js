/**
 * Lucky - 交易复盘工具
 * 主应用 JavaScript 文件
 */

// ===== Supabase 配置 =====
// 注意：使用时请替换为你的 Supabase 项目 URL 和 Anon Key
const SUPABASE_URL = 'https://mexgtooyjlcrnktnphsq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGd0b295amxjcm5rdG5waHNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjkwMTgsImV4cCI6MjA5MTgwNTAxOH0.AjstjIR_9AvHYXeQCXGv9-ZyJFSve5HdJUu3rjmXrLE';

// 初始化 Supabase 客户端
let supabase = null;
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ===== 全局状态 =====
const state = {
    currentUser: null,
    isAuthenticated: false,
    trades: [],
    checkins: [],
    settings: {
        initialCapital: 100000,
        customTags: [],
        customEmotions: [],
        customChecklist: []
    },
    currentPage: 'dashboard',
    selectedEmotion: null,
    selectedTags: new Set(),
    checklistCompleted: false,
    voiceRecognition: null
};

// ===== 预设数据 =====
const DEFAULT_EMOTIONS = [
    { emoji: '😤', name: 'FOMO' },
    { emoji: '😰', name: '恐惧' },
    { emoji: '😎', name: '冷静' },
    { emoji: '🤑', name: '贪婪' },
    { emoji: '😫', name: '焦虑' },
    { emoji: '😌', name: '平静' },
    { emoji: '🤬', name: '报复性交易' }
];

const DEFAULT_TAGS = [
    '计划内', '追高', '冲动单', '止损执行', '扛单', '加仓', '减仓', '突破入场', '回调入场'
];

const DEFAULT_CHECKLIST = [
    '趋势确认了吗？',
    '止损设了吗？',
    '仓位是否超标？',
    '当前是否情绪上头？',
    '是否符合交易计划？'
];

// ===== 工具函数 =====
function formatMoney(value) {
    if (value === null || value === undefined) return '¥0';
    const num = parseFloat(value);
    const sign = num >= 0 ? '+' : '';
    return `${sign}¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
    if (value === null || value === undefined) return '0%';
    return `${(value * 100).toFixed(1)}%`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}

function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ===== 本地存储操作 =====
function saveToLocalStorage() {
    const data = {
        trades: state.trades,
        checkins: state.checkins,
        settings: state.settings,
        timestamp: Date.now()
    };
    localStorage.setItem('lucky_data', JSON.stringify(data));
}

function loadFromLocalStorage() {
    const data = localStorage.getItem('lucky_data');
    if (data) {
        const parsed = JSON.parse(data);
        state.trades = parsed.trades || [];
        state.checkins = parsed.checkins || [];
        state.settings = { ...state.settings, ...(parsed.settings || {}) };
    }
}

// ===== Supabase 数据库操作 =====
async function syncWithSupabase() {
    if (!supabase || !state.isAuthenticated) return;

    try {
        // 同步交易记录
        const { data: tradesData, error: tradesError } = await supabase
            .from('trades')
            .select('*')
            .order('date', { ascending: false });

        if (tradesError) throw tradesError;

        // 同步打卡记录
        const { data: checkinsData, error: checkinsError } = await supabase
            .from('daily_checkin')
            .select('*');

        if (checkinsError) throw checkinsError;

        // 合并本地和云端数据
        const localTradeIds = new Set(state.trades.map(t => t.id));
        const newTradesFromCloud = tradesData.filter(t => !localTradeIds.has(t.id));
        state.trades = [...state.trades, ...newTradesFromCloud];

        const localCheckinIds = new Set(state.checkins.map(c => c.id));
        const newCheckinsFromCloud = checkinsData.filter(c => !localCheckinIds.has(c.id));
        state.checkins = [...state.checkins, ...newCheckinsFromCloud];

        saveToLocalStorage();
        showToast('数据同步成功');
    } catch (error) {
        console.error('Sync error:', error);
        showToast('同步失败，使用本地数据');
    }
}

async function saveTradeToSupabase(trade) {
    if (!supabase || !state.isAuthenticated) return;

    try {
        const { error } = await supabase.from('trades').upsert({
            ...trade,
            user_id: state.currentUser.id
        });
        if (error) throw error;
    } catch (error) {
        console.error('Save trade error:', error);
    }
}

async function deleteTradeFromSupabase(tradeId) {
    if (!supabase || !state.isAuthenticated) return;

    try {
        const { error } = await supabase.from('trades').delete().eq('id', tradeId);
        if (error) throw error;
    } catch (error) {
        console.error('Delete trade error:', error);
    }
}

async function saveCheckinToSupabase(checkin) {
    if (!supabase || !state.isAuthenticated) return;

    try {
        const { error } = await supabase.from('daily_checkin').upsert({
            ...checkin,
            user_id: state.currentUser.id
        });
        if (error) throw error;
    } catch (error) {
        console.error('Save checkin error:', error);
    }
}

async function saveSettingsToSupabase() {
    if (!supabase || !state.isAuthenticated) return;

    try {
        const { error } = await supabase.from('user_settings').upsert({
            user_id: state.currentUser.id,
            ...state.settings
        });
        if (error) throw error;
    } catch (error) {
        console.error('Save settings error:', error);
    }
}

// ===== 认证功能 =====
async function initAuth() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const authTabs = document.querySelectorAll('.auth-tab');
    const skipAuthBtn = document.getElementById('skip-auth');
    const logoutBtn = document.getElementById('logout-btn');

    // Tab 切换
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            authTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetTab = tab.dataset.tab;
            if (targetTab === 'login') {
                loginForm.classList.remove('hidden');
                registerForm.classList.add('hidden');
            } else {
                loginForm.classList.add('hidden');
                registerForm.classList.remove('hidden');
            }
        });
    });

    // 登录
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!supabase) {
            showToast('Supabase 未配置，请先体验');
            return;
        }

        const formData = new FormData(loginForm);
        const email = formData.get('email');
        const password = formData.get('password');

        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;

            state.currentUser = data.user;
            state.isAuthenticated = true;
            await onAuthSuccess();
        } catch (error) {
            showToast(`登录失败: ${error.message}`);
        }
    });

    // 注册
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!supabase) {
            showToast('Supabase 未配置，请先体验');
            return;
        }

        const formData = new FormData(registerForm);
        const email = formData.get('email');
        const password = formData.get('password');
        const nickname = formData.get('nickname');

        try {
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) throw error;

            // 创建用户资料
            await supabase.from('users_profile').insert({
                user_id: data.user.id,
                nickname: nickname,
                initial_capital: state.settings.initialCapital
            });

            state.currentUser = data.user;
            state.isAuthenticated = true;
            await onAuthSuccess();
        } catch (error) {
            showToast(`注册失败: ${error.message}`);
        }
    });

    // 跳过登录
    skipAuthBtn.addEventListener('click', () => {
        state.isAuthenticated = false;
        state.currentUser = null;
        document.getElementById('user-name').textContent = '访客';
        document.getElementById('auth-modal').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        initApp();
    });

    // 退出登录
    logoutBtn.addEventListener('click', async () => {
        if (supabase) {
            await supabase.auth.signOut();
        }
        state.isAuthenticated = false;
        state.currentUser = null;
        location.reload();
    });

    // 检查已有会话
    if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            state.currentUser = session.user;
            state.isAuthenticated = true;
            await onAuthSuccess();
        }
    }
}

async function onAuthSuccess() {
    document.getElementById('auth-modal').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('logout-btn').classList.remove('hidden');
    document.getElementById('user-name').textContent = state.currentUser.email;

    // 加载用户设置
    if (supabase) {
        const { data: profile } = await supabase
            .from('users_profile')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .single();

        if (profile) {
            state.settings.initialCapital = profile.initial_capital || 100000;
        }

        const { data: settings } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .single();

        if (settings) {
            state.settings = { ...state.settings, ...settings };
        }
    }

    await syncWithSupabase();
    initApp();
}

// ===== 页面导航 =====
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = item.dataset.page;

            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            pages.forEach(p => p.classList.remove('active'));
            document.getElementById(`page-${targetPage}`).classList.add('active');

            state.currentPage = targetPage;

            // 页面特定初始化
            if (targetPage === 'dashboard') renderDashboard();
            if (targetPage === 'list') renderTradesList();
            if (targetPage === 'analysis') renderAnalysis();
            if (targetPage === 'report') renderReport();
            if (targetPage === 'curve') renderEquityCurve();
            if (targetPage === 'settings') renderSettings();
        });
    });

    // 快捷操作按钮
    document.querySelectorAll('[data-page]').forEach(btn => {
        if (!btn.classList.contains('nav-item')) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const targetPage = btn.dataset.page;
                document.querySelector(`.nav-item[data-page="${targetPage}"]`).click();
            });
        }
    });
}

// ===== 仪表盘 =====
function renderDashboard() {
    const today = getToday();

    // 今日打卡状态
    const todayCheckin = state.checkins.find(c => c.date === today);
    const checkinStatus = document.getElementById('checkin-status');

    if (todayCheckin) {
        checkinStatus.textContent = todayCheckin.followed_plan ? '✓ 今日已打卡：按计划执行' : '✗ 今日已打卡：未按计划';
        checkinStatus.className = todayCheckin.followed_plan ? 'checkin-status success' : 'checkin-status danger';
    } else {
        checkinStatus.textContent = '还未打卡';
        checkinStatus.className = 'checkin-status';
    }

    // 连续天数
    document.getElementById('streak-days').textContent = calculateStreak();

    // 本周概览
    const weekStats = calculateWeekStats();
    document.getElementById('week-trades').textContent = weekStats.count;
    document.getElementById('week-winrate').textContent = formatPercent(weekStats.winRate);
    document.getElementById('week-pnl').textContent = formatMoney(weekStats.totalPnl);
    document.getElementById('week-net-pnl').textContent = formatMoney(weekStats.totalPnl);

    const netPnlEl = document.getElementById('week-net-pnl');
    netPnlEl.className = 'stat-value ' + (weekStats.totalPnl >= 0 ? 'positive' : 'negative');

    // 资金曲线缩略图
    renderDashboardChart();
}

function calculateStreak() {
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < 365; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const checkin = state.checkins.find(c => c.date === dateStr);
        if (checkin && checkin.followed_plan) {
            streak++;
        } else if (i > 0 || !checkin) {
            break;
        }
    }

    return streak;
}

function calculateWeekStats() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekTrades = state.trades.filter(t => new Date(t.date) >= weekAgo);

    const count = weekTrades.length;
    const wins = weekTrades.filter(t => parseFloat(t.pnl) > 0).length;
    const winRate = count > 0 ? wins / count : 0;
    const totalPnl = weekTrades.reduce((sum, t) => sum + parseFloat(t.pnl || 0), 0);

    return { count, winRate, totalPnl };
}

function renderDashboardChart() {
    const ctx = document.getElementById('dashboard-chart');
    if (!ctx) return;

    const equityData = calculateEquityCurve(30);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: equityData.map(d => d.date.slice(5)),
            datasets: [{
                data: equityData.map(d => d.equity),
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { display: false },
                y: {
                    display: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#6a6a8a',
                        font: { size: 10 },
                        callback: function(value) {
                            return '¥' + (value / 1000).toFixed(0) + 'k';
                        }
                    }
                }
            }
        }
    });
}

// ===== 打卡功能 =====
function initCheckin() {
    document.getElementById('checkin-yes').addEventListener('click', () => doCheckin(true));
    document.getElementById('checkin-no').addEventListener('click', () => doCheckin(false));
}

async function doCheckin(followedPlan) {
    const today = getToday();
    const existingCheckin = state.checkins.find(c => c.date === today);

    if (existingCheckin) {
        existingCheckin.followed_plan = followedPlan;
    } else {
        const checkin = {
            id: generateId(),
            date: today,
            followed_plan: followedPlan,
            created_at: new Date().toISOString()
        };
        state.checkins.push(checkin);
        await saveCheckinToSupabase(checkin);
    }

    saveToLocalStorage();
    renderDashboard();
    showToast(followedPlan ? '打卡成功：按计划执行' : '打卡完成：记录未按计划');
}

// ===== 交易记录 =====
function initRecordForm() {
    // 初始化检查清单
    renderChecklist();

    // 初始化情绪选择
    renderEmotionSelector();

    // 初始化标签选择
    renderTagsSelector();

    // 设置默认日期
    document.querySelector('input[name="date"]').value = getToday();

    // 语音输入
    initVoiceInput();

    // 表单提交
    document.getElementById('trade-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveTrade();
    });
}

function renderChecklist() {
    const container = document.getElementById('checklist-items');
    const checklist = state.settings.customChecklist.length > 0
        ? state.settings.customChecklist
        : DEFAULT_CHECKLIST;

    container.innerHTML = checklist.map((item, index) => `
        <div class="checklist-item">
            <input type="checkbox" id="check-${index}" data-index="${index}">
            <label for="check-${index}">${item}</label>
        </div>
    `).join('');

    // 监听检查项变化
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', updateChecklistStatus);
    });
}

function updateChecklistStatus() {
    const checkboxes = document.querySelectorAll('#checklist-items input[type="checkbox"]');
    const checked = Array.from(checkboxes).filter(cb => cb.checked).length;
    state.checklistCompleted = checked === checkboxes.length;
}

function renderEmotionSelector() {
    const container = document.getElementById('emotion-selector');
    const emotions = state.settings.customEmotions.length > 0
        ? state.settings.customEmotions
        : DEFAULT_EMOTIONS;

    container.innerHTML = emotions.map((emotion, index) => `
        <div class="emotion-option" data-emotion="${emotion.name}" data-index="${index}">
            <span>${emotion.emoji}</span>
            <span>${emotion.name}</span>
        </div>
    `).join('');

    container.querySelectorAll('.emotion-option').forEach(option => {
        option.addEventListener('click', () => {
            container.querySelectorAll('.emotion-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            state.selectedEmotion = {
                name: option.dataset.emotion,
                emoji: option.querySelector('span:first-child').textContent
            };
        });
    });
}

function renderTagsSelector() {
    const container = document.getElementById('tags-selector');
    const tags = [...DEFAULT_TAGS, ...state.settings.customTags];

    container.innerHTML = tags.map(tag => `
        <div class="tag-option" data-tag="${tag}">${tag}</div>
    `).join('');

    container.querySelectorAll('.tag-option').forEach(option => {
        option.addEventListener('click', () => {
            const tag = option.dataset.tag;
            if (state.selectedTags.has(tag)) {
                state.selectedTags.delete(tag);
                option.classList.remove('selected');
            } else {
                state.selectedTags.add(tag);
                option.classList.add('selected');
            }
        });
    });
}

function initVoiceInput() {
    const voiceBtn = document.getElementById('voice-btn');
    const notesField = document.querySelector('textarea[name="notes"]');
    const voiceStatus = document.getElementById('voice-status');

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        voiceBtn.style.display = 'none';
        voiceStatus.textContent = '您的浏览器不支持语音识别';
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    state.voiceRecognition = new SpeechRecognition();
    state.voiceRecognition.lang = 'zh-CN';
    state.voiceRecognition.continuous = true;
    state.voiceRecognition.interimResults = true;

    let isRecording = false;

    state.voiceRecognition.onstart = () => {
        isRecording = true;
        voiceBtn.classList.add('recording');
        voiceStatus.textContent = '正在录音...';
    };

    state.voiceRecognition.onend = () => {
        isRecording = false;
        voiceBtn.classList.remove('recording');
        voiceStatus.textContent = '';
    };

    state.voiceRecognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        if (finalTranscript) {
            notesField.value += (notesField.value ? ' ' : '') + finalTranscript;
        }

        voiceStatus.textContent = interimTranscript || '正在录音...';
    };

    state.voiceRecognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        voiceStatus.textContent = '语音识别出错';
        isRecording = false;
        voiceBtn.classList.remove('recording');
    };

    voiceBtn.addEventListener('click', () => {
        if (isRecording) {
            state.voiceRecognition.stop();
        } else {
            state.voiceRecognition.start();
        }
    });
}

async function saveTrade() {
    const form = document.getElementById('trade-form');
    const formData = new FormData(form);

    // 处理截图上传
    let screenshotUrl = null;
    const screenshotFile = formData.get('screenshot');
    if (screenshotFile && screenshotFile.size > 0) {
        // 先存储为 base64，后续可以上传到 Supabase Storage
        screenshotUrl = await fileToBase64(screenshotFile);
    }

    const trade = {
        id: generateId(),
        date: formData.get('date'),
        symbol: formData.get('symbol').toUpperCase(),
        direction: formData.get('direction'),
        entry_price: parseFloat(formData.get('entry_price')),
        exit_price: parseFloat(formData.get('exit_price')),
        position_size: parseFloat(formData.get('position_size')),
        pnl: parseFloat(formData.get('pnl')),
        emotion: state.selectedEmotion,
        tags: Array.from(state.selectedTags),
        checklist_completed: state.checklistCompleted,
        notes: formData.get('notes'),
        screenshot_url: screenshotUrl,
        created_at: new Date().toISOString()
    };

    state.trades.push(trade);
    saveToLocalStorage();
    await saveTradeToSupabase(trade);

    showToast('交易记录已保存');

    // 重置表单
    form.reset();
    document.querySelector('input[name="date"]').value = getToday();
    state.selectedEmotion = null;
    state.selectedTags.clear();
    document.querySelectorAll('.emotion-option').forEach(o => o.classList.remove('selected'));
    document.querySelectorAll('.tag-option').forEach(o => o.classList.remove('selected'));
    document.querySelectorAll('#checklist-items input[type="checkbox"]').forEach(cb => cb.checked = false);
}

function fileToBase64(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
}

// ===== 复盘列表 =====
function renderTradesList() {
    const container = document.getElementById('trades-list');

    // 更新品种筛选下拉框
    const symbols = [...new Set(state.trades.map(t => t.symbol))];
    const symbolFilter = document.getElementById('filter-symbol');
    const currentSymbol = symbolFilter.value;

    symbolFilter.innerHTML = '<option value="">所有品种</option>' +
        symbols.map(s => `<option value="${s}">${s}</option>`).join('');
    symbolFilter.value = currentSymbol;

    // 获取筛选条件
    const startDate = document.getElementById('filter-date-start').value;
    const endDate = document.getElementById('filter-date-end').value;
    const symbol = symbolFilter.value;

    // 筛选交易
    let filteredTrades = [...state.trades].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (startDate) {
        filteredTrades = filteredTrades.filter(t => t.date >= startDate);
    }
    if (endDate) {
        filteredTrades = filteredTrades.filter(t => t.date <= endDate);
    }
    if (symbol) {
        filteredTrades = filteredTrades.filter(t => t.symbol === symbol);
    }

    if (filteredTrades.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <h3>暂无交易记录</h3>
                <p>点击"记录"页开始添加您的第一笔交易</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredTrades.map(trade => `
        <div class="trade-item" data-id="${trade.id}">
            <div class="trade-header">
                <div class="trade-info">
                    <span class="trade-symbol">${trade.symbol}</span>
                    <span class="trade-direction ${trade.direction}">${trade.direction === 'long' ? '做多' : '做空'}</span>
                    <span class="trade-date">${formatDate(trade.date)}</span>
                    ${trade.checklist_completed ? '' : '<span style="color: var(--warning); font-size: 0.75rem;">⚠ 未完成检查</span>'}
                </div>
                <span class="trade-pnl ${parseFloat(trade.pnl) >= 0 ? 'positive' : 'negative'}">
                    ${formatMoney(trade.pnl)}
                </span>
            </div>
            <div class="trade-details">
                <div class="trade-detail">
                    <span class="trade-detail-label">开仓价</span>
                    <span class="trade-detail-value">${trade.entry_price}</span>
                </div>
                <div class="trade-detail">
                    <span class="trade-detail-label">平仓价</span>
                    <span class="trade-detail-value">${trade.exit_price}</span>
                </div>
                <div class="trade-detail">
                    <span class="trade-detail-label">仓位</span>
                    <span class="trade-detail-value">${trade.position_size}</span>
                </div>
            </div>
            ${trade.tags && trade.tags.length > 0 ? `
                <div class="trade-tags">
                    ${trade.tags.map(tag => `<span class="trade-tag">${tag}</span>`).join('')}
                    ${trade.emotion ? `<span class="trade-tag trade-emotion">${trade.emotion.emoji} ${trade.emotion.name}</span>` : ''}
                </div>
            ` : ''}
            ${trade.notes ? `<div class="trade-notes">${trade.notes}</div>` : ''}
            <div class="trade-actions">
                ${trade.screenshot_url ? `<button onclick="viewScreenshot('${trade.screenshot_url}')">查看截图</button>` : ''}
                <button onclick="deleteTrade('${trade.id}')">删除</button>
            </div>
        </div>
    `).join('');
}

function initListFilters() {
    document.getElementById('filter-btn').addEventListener('click', () => renderTradesList());
    document.getElementById('clear-filter-btn').addEventListener('click', () => {
        document.getElementById('filter-date-start').value = '';
        document.getElementById('filter-date-end').value = '';
        document.getElementById('filter-symbol').value = '';
        renderTradesList();
    });
}

function viewScreenshot(url) {
    const modal = document.getElementById('screenshot-modal');
    const img = document.getElementById('screenshot-preview');
    img.src = url;
    modal.classList.remove('hidden');
}

async function deleteTrade(tradeId) {
    if (!confirm('确定要删除这条交易记录吗？')) return;

    state.trades = state.trades.filter(t => t.id !== tradeId);
    saveToLocalStorage();
    await deleteTradeFromSupabase(tradeId);

    renderTradesList();
    showToast('交易记录已删除');
}

// ===== 分析页面 =====
function renderAnalysis() {
    if (state.trades.length < 5) {
        document.getElementById('tags-analysis').innerHTML = '<p class="pattern-placeholder">数据积累中，至少需要5笔交易才能分析</p>';
        document.getElementById('emotion-analysis').innerHTML = '<p class="pattern-placeholder">数据积累中，至少需要5笔交易才能分析</p>';
        document.getElementById('pattern-analysis').innerHTML = '<p class="pattern-placeholder">数据积累中，至少需要20笔交易才能分析</p>';
        return;
    }

    renderTagsAnalysis();
    renderEmotionAnalysis();
    renderPatternAnalysis();
}

function renderTagsAnalysis() {
    const container = document.getElementById('tags-analysis');
    const allTags = [...DEFAULT_TAGS, ...state.settings.customTags];

    const tagStats = allTags.map(tag => {
        const tradesWithTag = state.trades.filter(t => t.tags && t.tags.includes(tag));
        const count = tradesWithTag.length;
        const wins = tradesWithTag.filter(t => parseFloat(t.pnl) > 0).length;
        const winRate = count > 0 ? wins / count : 0;
        const avgPnl = count > 0 ? tradesWithTag.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / count : 0;

        return { tag, count, winRate, avgPnl };
    }).filter(s => s.count > 0).sort((a, b) => b.count - a.count);

    if (tagStats.length === 0) {
        container.innerHTML = '<p class="pattern-placeholder">暂无标签数据</p>';
        return;
    }

    container.innerHTML = `
        <table class="analysis-table">
            <thead>
                <tr>
                    <th>标签</th>
                    <th>次数</th>
                    <th>胜率</th>
                    <th>平均盈亏</th>
                </tr>
            </thead>
            <tbody>
                ${tagStats.map(stat => `
                    <tr>
                        <td>${stat.tag}</td>
                        <td>${stat.count}</td>
                        <td>
                            ${formatPercent(stat.winRate)}
                            <div class="analysis-bar">
                                <div class="analysis-bar-fill" style="width: ${stat.winRate * 100}%; background: ${stat.winRate > 0.5 ? 'var(--success)' : 'var(--danger)'};"></div>
                            </div>
                        </td>
                        <td class="${stat.avgPnl >= 0 ? 'positive' : 'negative'}">${formatMoney(stat.avgPnl)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderEmotionAnalysis() {
    const container = document.getElementById('emotion-analysis');
    const emotions = state.settings.customEmotions.length > 0
        ? state.settings.customEmotions
        : DEFAULT_EMOTIONS;

    const emotionStats = emotions.map(emotion => {
        const tradesWithEmotion = state.trades.filter(t => t.emotion && t.emotion.name === emotion.name);
        const count = tradesWithEmotion.length;
        const wins = tradesWithEmotion.filter(t => parseFloat(t.pnl) > 0).length;
        const winRate = count > 0 ? wins / count : 0;
        const avgPnl = count > 0 ? tradesWithEmotion.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / count : 0;

        return { emotion, count, winRate, avgPnl };
    }).filter(s => s.count > 0).sort((a, b) => b.winRate - a.winRate);

    if (emotionStats.length === 0) {
        container.innerHTML = '<p class="pattern-placeholder">暂无情绪数据</p>';
        return;
    }

    container.innerHTML = emotionStats.map(stat => `
        <div class="emotion-stat-item" style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 1.25rem;">${stat.emotion.emoji} ${stat.emotion.name}</span>
                <span class="${stat.avgPnl >= 0 ? 'positive' : 'negative'}" style="font-weight: 600;">${formatMoney(stat.avgPnl)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: var(--text-muted); font-size: 0.85rem;">${stat.count} 笔交易</span>
                <span style="font-weight: 600; color: ${stat.winRate > 0.5 ? 'var(--success)' : 'var(--danger)'};">${formatPercent(stat.winRate)} 胜率</span>
            </div>
            <div class="analysis-bar">
                <div class="analysis-bar-fill" style="width: ${stat.winRate * 100}%; background: ${stat.winRate > 0.5 ? 'var(--success)' : 'var(--danger)'};"></div>
            </div>
        </div>
    `).join('');
}

function renderPatternAnalysis() {
    const container = document.getElementById('pattern-analysis');

    if (state.trades.length < 20) {
        container.innerHTML = '<p class="pattern-placeholder">数据积累中，至少需要20笔交易才能分析</p>';
        return;
    }

    const patterns = [];

    // 分析1: 冲动单 vs 计划内交易
    const impulseTrades = state.trades.filter(t => t.tags && t.tags.includes('冲动单'));
    const planTrades = state.trades.filter(t => t.tags && t.tags.includes('计划内'));

    if (impulseTrades.length > 0 && planTrades.length > 0) {
        const impulseAvgPnl = impulseTrades.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / impulseTrades.length;
        const planAvgPnl = planTrades.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / planTrades.length;
        const ratio = Math.abs(impulseAvgPnl / planAvgPnl).toFixed(1);

        patterns.push({
            title: '冲动单的危害',
            desc: `带有"冲动单"标签的交易平均盈亏是"计划内"交易的 ${ratio} 倍。${impulseAvgPnl < planAvgPnl ? '控制冲动，坚持计划！' : ''}`,
            type: 'danger'
        });
    }

    // 分析2: 检查清单完成率
    const completedTrades = state.trades.filter(t => t.checklist_completed);
    const uncompletedTrades = state.trades.filter(t => !t.checklist_completed);

    if (completedTrades.length > 0 && uncompletedTrades.length > 0) {
        const completedWinRate = completedTrades.filter(t => parseFloat(t.pnl) > 0).length / completedTrades.length;
        const uncompletedWinRate = uncompletedTrades.filter(t => parseFloat(t.pnl) > 0).length / uncompletedTrades.length;

        if (completedWinRate > uncompletedWinRate) {
            patterns.push({
                title: '检查清单的价值',
                desc: `完成检查清单的交易胜率为 ${formatPercent(completedWinRate)}，未完成的是 ${formatPercent(uncompletedWinRate)}。严格执行检查流程！`,
                type: 'warning'
            });
        }
    }

    // 分析3: 连续亏损后的行为
    const sortedTrades = [...state.trades].sort((a, b) => new Date(a.date) - new Date(b.date));
    let consecutiveLosses = 0;
    let tradesAfterLosses = [];

    for (let i = 0; i < sortedTrades.length - 1; i++) {
        if (parseFloat(sortedTrades[i].pnl) < 0) {
            consecutiveLosses++;
            if (consecutiveLosses >= 2) {
                tradesAfterLosses.push(sortedTrades[i + 1]);
            }
        } else {
            consecutiveLosses = 0;
        }
    }

    if (tradesAfterLosses.length > 0) {
        const avgPositionAfterLosses = tradesAfterLosses.reduce((sum, t) => sum + parseFloat(t.position_size || 0), 0) / tradesAfterLosses.length;
        const avgPositionNormal = state.trades.reduce((sum, t) => sum + parseFloat(t.position_size || 0), 0) / state.trades.length;

        if (avgPositionAfterLosses > avgPositionNormal * 1.2) {
            patterns.push({
                title: '报复性交易倾向',
                desc: '连续亏损后，你的仓位往往会加大。冷静，不要让情绪影响决策！',
                type: 'danger'
            });
        }
    }

    // 分析4: 周五交易
    const fridayTrades = state.trades.filter(t => {
        const date = new Date(t.date);
        return date.getDay() === 5;
    });

    if (fridayTrades.length > 5) {
        const fridayWinRate = fridayTrades.filter(t => parseFloat(t.pnl) > 0).length / fridayTrades.length;
        if (fridayWinRate < 0.4) {
            patterns.push({
                title: '周五效应',
                desc: `你周五的交易胜率仅为 ${formatPercent(fridayWinRate)}，明显低于平均水平。考虑周五减少交易或提前收工。`,
                type: 'warning'
            });
        }
    }

    if (patterns.length === 0) {
        container.innerHTML = '<p class="pattern-placeholder">继续积累数据，发现你的交易模式...</p>';
        return;
    }

    container.innerHTML = `
        <div class="pattern-list">
            ${patterns.map(p => `
                <div class="pattern-item ${p.type}">
                    <div class="pattern-title">${p.title}</div>
                    <div class="pattern-desc">${p.desc}</div>
                </div>
            `).join('')}
        </div>
    `;
}

// ===== 报告页面 =====
function renderReport() {
    const tabs = document.querySelectorAll('.report-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            generateReport(tab.dataset.report);
        });
    });

    generateReport('weekly');
}

function generateReport(type) {
    const container = document.getElementById('report-content');
    const now = new Date();

    let startDate, endDate, title;

    if (type === 'weekly') {
        // 本周
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? 0 : 1);
        startDate = new Date(now.setDate(diff));
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        title = '本周交易周报';
    } else {
        // 本月
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        title = '本月交易月报';
    }

    const periodTrades = state.trades.filter(t => {
        const tradeDate = new Date(t.date);
        return tradeDate >= startDate && tradeDate <= endDate;
    });

    if (periodTrades.length === 0) {
        container.innerHTML = `
            <div class="report-card">
                <div class="report-header">
                    <h3>${title}</h3>
                    <p class="report-period">${formatDate(startDate.toISOString().split('T')[0])} - ${formatDate(endDate.toISOString().split('T')[0])}</p>
                </div>
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <h3>暂无交易数据</h3>
                    <p>本周期内没有交易记录</p>
                </div>
            </div>
        `;
        return;
    }

    const stats = calculateReportStats(periodTrades);

    container.innerHTML = `
        <div class="report-card" id="report-export-card">
            <div class="report-header">
                <h3>${title}</h3>
                <p class="report-period">${formatDate(startDate.toISOString().split('T')[0])} - ${formatDate(endDate.toISOString().split('T')[0])}</p>
            </div>

            <div class="report-stats-grid">
                <div class="report-stat">
                    <span class="report-stat-label">交易次数</span>
                    <span class="report-stat-value">${stats.count}</span>
                </div>
                <div class="report-stat">
                    <span class="report-stat-label">胜率</span>
                    <span class="report-stat-value ${stats.winRate >= 0.5 ? 'positive' : 'negative'}">${formatPercent(stats.winRate)}</span>
                </div>
                <div class="report-stat">
                    <span class="report-stat-label">盈亏比</span>
                    <span class="report-stat-value">${stats.profitFactor.toFixed(2)}</span>
                </div>
                <div class="report-stat">
                    <span class="report-stat-label">总盈亏</span>
                    <span class="report-stat-value ${stats.totalPnl >= 0 ? 'positive' : 'negative'}">${formatMoney(stats.totalPnl)}</span>
                </div>
            </div>

            <div class="report-section">
                <h4>交易统计</h4>
                <div class="trade-details">
                    <div class="trade-detail">
                        <span class="trade-detail-label">最大单笔盈利</span>
                        <span class="trade-detail-value positive">${formatMoney(stats.maxProfit)}</span>
                    </div>
                    <div class="trade-detail">
                        <span class="trade-detail-label">最大单笔亏损</span>
                        <span class="trade-detail-value negative">${formatMoney(stats.maxLoss)}</span>
                    </div>
                    <div class="trade-detail">
                        <span class="trade-detail-label">平均盈利</span>
                        <span class="trade-detail-value positive">${formatMoney(stats.avgWin)}</span>
                    </div>
                    <div class="trade-detail">
                        <span class="trade-detail-label">平均亏损</span>
                        <span class="trade-detail-value negative">${formatMoney(stats.avgLoss)}</span>
                    </div>
                </div>
            </div>

            ${stats.topSymbol ? `
            <div class="report-section">
                <h4>最常交易品种</h4>
                <p>${stats.topSymbol.symbol} - ${stats.topSymbol.count} 笔交易，胜率 ${formatPercent(stats.topSymbol.winRate)}</p>
            </div>
            ` : ''}

            <div class="report-export">
                <button class="btn-primary" onclick="exportReport()">导出为图片</button>
            </div>
        </div>
    `;
}

function calculateReportStats(trades) {
    const count = trades.length;
    const wins = trades.filter(t => parseFloat(t.pnl) > 0);
    const losses = trades.filter(t => parseFloat(t.pnl) < 0);

    const winRate = count > 0 ? wins.length / count : 0;
    const totalPnl = trades.reduce((sum, t) => sum + parseFloat(t.pnl), 0);

    const grossProfit = wins.reduce((sum, t) => sum + parseFloat(t.pnl), 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + parseFloat(t.pnl), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const pnls = trades.map(t => parseFloat(t.pnl));
    const maxProfit = Math.max(...pnls);
    const maxLoss = Math.min(...pnls);

    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? -grossLoss / losses.length : 0;

    // 最常交易品种
    const symbolCounts = {};
    trades.forEach(t => {
        if (!symbolCounts[t.symbol]) {
            symbolCounts[t.symbol] = { count: 0, wins: 0 };
        }
        symbolCounts[t.symbol].count++;
        if (parseFloat(t.pnl) > 0) symbolCounts[t.symbol].wins++;
    });

    let topSymbol = null;
    let maxCount = 0;
    for (const [symbol, data] of Object.entries(symbolCounts)) {
        if (data.count > maxCount) {
            maxCount = data.count;
            topSymbol = {
                symbol,
                count: data.count,
                winRate: data.wins / data.count
            };
        }
    }

    return {
        count,
        winRate,
        profitFactor,
        totalPnl,
        maxProfit,
        maxLoss,
        avgWin,
        avgLoss,
        topSymbol
    };
}

async function exportReport() {
    const card = document.getElementById('report-export-card');
    if (!card) return;

    try {
        const canvas = await html2canvas(card, {
            backgroundColor: '#1e1e32',
            scale: 2
        });

        const link = document.createElement('a');
        link.download = `Lucky_交易报告_${getToday()}.png`;
        link.href = canvas.toDataURL();
        link.click();

        showToast('报告已导出');
    } catch (error) {
        console.error('Export error:', error);
        showToast('导出失败');
    }
}

// ===== 资金曲线 =====
function renderEquityCurve() {
    const rangeBtns = document.querySelectorAll('.range-btn');
    rangeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            rangeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            drawEquityCurve(btn.dataset.range);
        });
    });

    drawEquityCurve('7');
}

function calculateEquityCurve(days) {
    const sortedTrades = [...state.trades].sort((a, b) => new Date(a.date) - new Date(b.date));

    if (sortedTrades.length === 0) return [];

    let startDate = new Date(sortedTrades[0].date);
    if (days !== 'all') {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
        startDate = cutoffDate;
    }

    let equity = state.settings.initialCapital;
    const data = [];

    // 按日期分组交易
    const tradesByDate = {};
    sortedTrades.forEach(trade => {
        if (new Date(trade.date) >= startDate) {
            if (!tradesByDate[trade.date]) tradesByDate[trade.date] = [];
            tradesByDate[trade.date].push(trade);
        }
    });

    // 生成每日权益数据
    const dates = Object.keys(tradesByDate).sort();
    dates.forEach(date => {
        const dayPnl = tradesByDate[date].reduce((sum, t) => sum + parseFloat(t.pnl), 0);
        equity += dayPnl;
        data.push({ date, equity });
    });

    return data;
}

function drawEquityCurve(range) {
    const ctx = document.getElementById('equity-curve-chart');
    if (!ctx) return;

    const equityData = calculateEquityCurve(range);

    if (equityData.length === 0) {
        // 显示空状态
        document.getElementById('initial-capital').textContent = formatMoney(state.settings.initialCapital);
        document.getElementById('current-capital').textContent = formatMoney(state.settings.initialCapital);
        document.getElementById('max-drawdown').textContent = '0%';
        document.getElementById('total-return').textContent = '0%';

        // 清空图表
        const chart = Chart.getChart(ctx);
        if (chart) chart.destroy();
        return;
    }

    const initialEquity = equityData[0].equity;
    const currentEquity = equityData[equityData.length - 1].equity;

    // 计算最大回撤
    let maxEquity = initialEquity;
    let maxDrawdown = 0;
    equityData.forEach(d => {
        if (d.equity > maxEquity) maxEquity = d.equity;
        const drawdown = (maxEquity - d.equity) / maxEquity;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    const totalReturn = (currentEquity - state.settings.initialCapital) / state.settings.initialCapital;

    // 更新统计
    document.getElementById('initial-capital').textContent = formatMoney(state.settings.initialCapital);
    document.getElementById('current-capital').textContent = formatMoney(currentEquity);
    document.getElementById('max-drawdown').textContent = formatPercent(maxDrawdown);
    document.getElementById('total-return').textContent = formatPercent(totalReturn);

    // 绘制图表
    const chart = Chart.getChart(ctx);
    if (chart) chart.destroy();

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: equityData.map(d => d.date.slice(5)),
            datasets: [{
                label: '资金曲线',
                data: equityData.map(d => d.equity),
                borderColor: totalReturn >= 0 ? '#22c55e' : '#ef4444',
                backgroundColor: totalReturn >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return '权益: ' + formatMoney(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#6a6a8a',
                        maxTicksLimit: 8
                    }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#6a6a8a',
                        callback: function(value) {
                            return '¥' + (value / 1000).toFixed(0) + 'k';
                        }
                    }
                }
            }
        }
    });
}

// ===== 设置页面 =====
function renderSettings() {
    // 账户信息
    document.getElementById('setting-nickname').value = state.currentUser?.email?.split('@')[0] || '';
    document.getElementById('setting-capital').value = state.settings.initialCapital;

    // 自定义标签
    renderCustomTags();

    // 自定义情绪
    renderCustomEmotions();

    // 检查清单
    renderChecklistSettings();
}

function renderCustomTags() {
    const container = document.getElementById('custom-tags-list');
    container.innerHTML = state.settings.customTags.map(tag => `
        <div class="tag-item">
            <span>${tag}</span>
            <button class="delete-btn" onclick="removeCustomTag('${tag}')">删除</button>
        </div>
    `).join('');
}

function renderCustomEmotions() {
    const container = document.getElementById('custom-emotions-list');
    container.innerHTML = state.settings.customEmotions.map((emotion, index) => `
        <div class="emotion-item">
            <span>${emotion.emoji} ${emotion.name}</span>
            <button class="delete-btn" onclick="removeCustomEmotion(${index})">删除</button>
        </div>
    `).join('');
}

function renderChecklistSettings() {
    const container = document.getElementById('checklist-settings');
    const checklist = state.settings.customChecklist.length > 0
        ? state.settings.customChecklist
        : DEFAULT_CHECKLIST;

    container.innerHTML = checklist.map((item, index) => `
        <div class="checklist-item-setting">
            <span>${item}</span>
            ${index >= DEFAULT_CHECKLIST.length ? `<button class="delete-btn" onclick="removeChecklistItem(${index})">删除</button>` : ''}
        </div>
    `).join('');
}

function initSettings() {
    // 保存账户信息
    document.getElementById('save-profile').addEventListener('click', async () => {
        state.settings.initialCapital = parseFloat(document.getElementById('setting-capital').value) || 100000;
        saveToLocalStorage();
        await saveSettingsToSupabase();
        showToast('设置已保存');
    });

    // 添加自定义标签
    document.getElementById('add-tag-btn').addEventListener('click', async () => {
        const input = document.getElementById('new-tag-input');
        const tag = input.value.trim();
        if (tag && !state.settings.customTags.includes(tag) && !DEFAULT_TAGS.includes(tag)) {
            state.settings.customTags.push(tag);
            input.value = '';
            renderCustomTags();
            saveToLocalStorage();
            await saveSettingsToSupabase();
        }
    });

    // 添加自定义情绪
    document.getElementById('add-emotion-btn').addEventListener('click', async () => {
        const emojiInput = document.getElementById('new-emotion-emoji');
        const nameInput = document.getElementById('new-emotion-name');
        const emoji = emojiInput.value.trim();
        const name = nameInput.value.trim();

        if (emoji && name) {
            state.settings.customEmotions.push({ emoji, name });
            emojiInput.value = '';
            nameInput.value = '';
            renderCustomEmotions();
            saveToLocalStorage();
            await saveSettingsToSupabase();
        }
    });

    // 添加检查项
    document.getElementById('add-checklist-btn').addEventListener('click', async () => {
        const input = document.getElementById('new-checklist-input');
        const item = input.value.trim();
        if (item) {
            state.settings.customChecklist.push(item);
            input.value = '';
            renderChecklistSettings();
            saveToLocalStorage();
            await saveSettingsToSupabase();
        }
    });

    // 导出数据
    document.getElementById('export-data').addEventListener('click', () => {
        const data = {
            trades: state.trades,
            checkins: state.checkins,
            settings: state.settings,
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lucky_backup_${getToday()}.json`;
        link.click();
        URL.revokeObjectURL(url);

        showToast('数据已导出');
    });

    // 导入数据
    document.getElementById('import-data-btn').addEventListener('click', () => {
        document.getElementById('import-data-file').click();
    });

    document.getElementById('import-data-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);

                if (confirm(`确定要导入数据吗？这将合并 ${data.trades?.length || 0} 笔交易记录。`)) {
                    if (data.trades) {
                        state.trades = [...state.trades, ...data.trades];
                    }
                    if (data.checkins) {
                        state.checkins = [...state.checkins, ...data.checkins];
                    }
                    if (data.settings) {
                        state.settings = { ...state.settings, ...data.settings };
                    }

                    saveToLocalStorage();

                    // 同步到云端
                    if (state.isAuthenticated) {
                        for (const trade of data.trades || []) {
                            await saveTradeToSupabase(trade);
                        }
                    }

                    showToast('数据导入成功');
                    renderSettings();
                }
            } catch (error) {
                showToast('导入失败：文件格式错误');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });
}

function removeCustomTag(tag) {
    state.settings.customTags = state.settings.customTags.filter(t => t !== tag);
    renderCustomTags();
    saveToLocalStorage();
    saveSettingsToSupabase();
}

function removeCustomEmotion(index) {
    state.settings.customEmotions.splice(index, 1);
    renderCustomEmotions();
    saveToLocalStorage();
    saveSettingsToSupabase();
}

function removeChecklistItem(index) {
    state.settings.customChecklist.splice(index, 1);
    renderChecklistSettings();
    saveToLocalStorage();
    saveSettingsToSupabase();
}

// ===== 初始化 =====
function initApp() {
    // 从本地存储加载数据
    loadFromLocalStorage();

    // 初始化默认设置
    if (!state.settings.customTags) state.settings.customTags = [];
    if (!state.settings.customEmotions) state.settings.customEmotions = [];
    if (!state.settings.customChecklist) state.settings.customChecklist = [];

    // 初始化页面
    initNavigation();
    initCheckin();
    initRecordForm();
    initListFilters();
    initSettings();

    // 初始化模态框
    document.getElementById('screenshot-modal').addEventListener('click', (e) => {
        if (e.target.id === 'screenshot-modal' || e.target.classList.contains('modal-close')) {
            document.getElementById('screenshot-modal').classList.add('hidden');
        }
    });

    // 显示当前日期
    document.querySelector('.date-display').textContent = new Date().toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });

    // 渲染仪表盘
    renderDashboard();
}

// ===== 启动应用 =====
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
});