// Gerenciamento de Estado e Dados
let entries = JSON.parse(localStorage.getItem('gomez_club_entries')) || [];
// Normalização de dados legados
entries = entries.map(e => ({
    services: 0,
    subs: 0,
    subsQtd: 0, // Novo campo
    cancellations: 0,
    ...e
}));
let attendants = JSON.parse(localStorage.getItem('gomez_club_attendants')) || ['Ana', 'Julia', 'Beatriz'];

let charts = {};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

const CLOUD_SYNC_URL = 'https://script.google.com/macros/s/AKfycbzZVR0fZMZtHmumkTtfJui70b3yNKHAAsE-HOUg3awewRTvr2ZYZ_etmrfztgn998MjHg/exec';

function initApp() {
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    document.getElementById('month-filter').value = currentMonth;
    
    updateAttendantSelects();
    renderTable();
    updateDashboard();
    
    // Auto-sync na inicialização
    setTimeout(() => syncWithCloud(true), 1000);

    // Polling Automático: Atualiza os dados da nuvem a cada 20 segundos
    setInterval(() => syncWithCloud(true), 20000);

    // Sync quando voltar para a aba (Celular)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            syncWithCloud(true);
        }
    });
}

// Callback Global para JSONP (Túnel de Dados)
window.handleCloudData = function(data) {
    if (data && Array.isArray(data)) {
        // MERGE INTELIGENTE: Mantém o que é local e atualiza com o que veio da nuvem
        const cloudData = data.map(e => ({
            messages: 0, appointments: 0, services: 0, subs: 0, subsQtd: 0, cancellations: 0,
            ...e
        }));

        // Cria um mapa para busca rápida por ID
        const entryMap = new Map();
        
        // 1. Carrega dados da nuvem (Base de verdade)
        cloudData.forEach(item => entryMap.set(item.id, item));

        // 2. Mescla com dados locais (O que ainda não subiu)
        entries.forEach(item => {
            if (!entryMap.has(item.id)) {
                entryMap.set(item.id, item);
            }
        });

        // 3. Atualiza estado global
        entries = Array.from(entryMap.values());
        localStorage.setItem('gomez_club_entries', JSON.stringify(entries));
        
        renderTable();
        updateDashboard();
        updateSyncStatus('online');
        console.log('Dados sincronizados com sucesso (Nuvem + Local).');
    }
};

function updateSyncStatus(status, text = '') {
    const indicator = document.getElementById('cloud-status-indicator');
    const statusText = indicator.querySelector('.status-text');
    
    indicator.className = `status-badge ${status}`;
    statusText.innerText = text || (status === 'online' ? 'Sincronizado' : status === 'syncing' ? 'Sincronizando...' : 'Desconectado');
}

function updateAttendantSelects() {
    const selects = [document.getElementById('form-attendant')];
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Selecione...</option>';
        attendants.forEach(att => {
            const opt = document.createElement('option');
            opt.value = att;
            opt.innerText = att;
            select.appendChild(opt);
        });
        select.value = currentValue;
    });
}

// Navegação entre Abas
function setupEventListeners() {
    // ... (rest of old code below)
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => {
            document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            
            li.classList.add('active');
            const tabId = `tab-${li.dataset.tab}`;
            document.getElementById(tabId).classList.add('active');
            
            const titles = { 'lancamentos': 'Lançamentos Gomez Club', 'dashboard': 'Performance Gomez Club' };
            document.getElementById('page-title').innerText = titles[li.dataset.tab];
            
            if (li.dataset.tab === 'dashboard') {
                updateDashboard();
            }
        });
    });

    // Modal
    const modal = document.getElementById('modal-container');
    document.getElementById('add-entry-btn').addEventListener('click', () => {
        modal.style.display = 'flex';
        document.getElementById('form-date').value = new Date().toISOString().split('T')[0];
    });

    document.querySelector('.close-btn').addEventListener('click', closeModal);
    document.querySelector('.cancel-btn').addEventListener('click', closeModal);

    // Form Submit
    document.getElementById('entry-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveEntry();
    });

    // Filter
    document.getElementById('month-filter').addEventListener('change', () => {
        renderTable();
        updateDashboard();
    });

    // Cloud Sync Automático (Sincronização Manual)
    const syncUrlInput = document.getElementById('sync-url');
    syncUrlInput.value = localStorage.getItem('gomez_club_sync_url') || CLOUD_SYNC_URL;
    
    syncUrlInput.addEventListener('change', () => {
        localStorage.setItem('gomez_club_sync_url', syncUrlInput.value.trim());
    });

    document.getElementById('sync-now-btn').addEventListener('click', () => syncWithCloud(false));

    // Gerenciar Atendentes
    const staffModal = document.getElementById('staff-modal');
    document.getElementById('manage-staff-btn').addEventListener('click', () => {
        renderStaffList();
        staffModal.style.display = 'flex';
    });

    document.getElementById('close-staff-modal').addEventListener('click', () => staffModal.style.display = 'none');
    document.getElementById('save-staff-btn').addEventListener('click', () => staffModal.style.display = 'none');
    
    document.getElementById('add-staff-btn').addEventListener('click', () => {
        const nameInput = document.getElementById('new-staff-name');
        const name = nameInput.value.trim();
        if (name && !attendants.includes(name)) {
            attendants.push(name);
            localStorage.setItem('gomez_club_attendants', JSON.stringify(attendants));
            nameInput.value = '';
            renderStaffList();
            updateAttendantSelects();
        }
    });

    // Lógica de destaque de campos por Ação
    document.getElementById('form-action').addEventListener('change', (e) => {
        const action = e.target.value;
        const groups = ['group-services', 'group-subs', 'group-sales', 'group-cancellations'];
        
        // Remove destaques anteriores
        groups.forEach(id => document.getElementById(id).classList.remove('highlighted'));

        // Aplica novos destaques
        if (action === 'Venda de Assinatura') {
            document.getElementById('group-subs').classList.add('highlighted');
        } else if (action === 'Cancelamento') {
            document.getElementById('group-cancellations').classList.add('highlighted');
        } else if (action === 'VIP / Combos' || action === 'Recompra' || action === 'Aniversariantes') {
            // Pode destacar serviços ou vendas se preferir, ou deixar padrão
        }
    });
}

function renderStaffList() {
    const list = document.getElementById('staff-list');
    list.innerHTML = '';
    attendants.forEach((att, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${att}</span>
            <button onclick="removeStaff(${index})" class="btn-icon-delete">&times;</button>
        `;
        list.appendChild(li);
    });
}

function removeStaff(index) {
    if (confirm(`Remover ${attendants[index]} da equipe?`)) {
        attendants.splice(index, 1);
        localStorage.setItem('gomez_club_attendants', JSON.stringify(attendants));
        renderStaffList();
        updateAttendantSelects();
    }
}

async function syncWithCloud(silent = false) {
    let urlInput = document.getElementById('sync-url');
    let url = urlInput.value.trim() || CLOUD_SYNC_URL;
    
    if (!url) {
        updateSyncStatus('offline');
        return;
    }

    const btn = document.getElementById('sync-now-btn');
    if (!silent) {
        btn.innerText = 'Sincronizando...';
        btn.disabled = true;
    }
    updateSyncStatus('syncing');

    try {
        // 1. SALVAR (SEM cabeçalhos restritos para o Google aceitar o POST de qualquer lugar)
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(entries)
        });
        
        console.log('Dados enviados com sucesso.');

        // 2. LER (Via JSONP para furar o CORS)
        setTimeout(() => {
            try {
                const cacheBuster = 't=' + Date.now();
                const jsonpUrl = `${url}${url.includes('?') ? '&' : '?'}callback=handleCloudData&${cacheBuster}`;
                
                const oldScript = document.getElementById('jsonp-sync');
                if (oldScript) oldScript.remove();

                const script = document.createElement('script');
                script.id = 'jsonp-sync';
                script.src = jsonpUrl;
                
                script.onerror = () => {
                    updateSyncStatus('online', 'Salvo (Ver Planilha)');
                };

                document.body.appendChild(script);
            } catch (e) { console.error('Erro na leitura (JSONP):', e); }
        }, 800);

        if (!silent) alert('Sincronização Concluída!');

    } catch (err) {
        console.error('Erro fatal na conexão:', err);
        updateSyncStatus('offline', 'Erro de Conexão');
        if (!silent) alert('Erro fatal: Não foi possível enviar os dados. Verifique sua URL ou se o Script está publicado como "Qualquer pessoa".');
    } finally {
        if (!silent) {
            btn.innerText = 'Sincronizar Agora';
            btn.disabled = false;
        }
    }
}

function closeModal() {
    document.getElementById('modal-container').style.display = 'none';
    document.getElementById('entry-form').reset();
    
    // Remover todos os destaques ao fechar
    const groups = ['group-services', 'group-subs', 'group-sales', 'group-cancellations'];
    groups.forEach(id => document.getElementById(id).classList.remove('highlighted'));
}

// Lógica de Dados
function saveEntry() {
    const newEntry = {
        id: Date.now(),
        date: document.getElementById('form-date').value,
        attendant: document.getElementById('form-attendant').value,
        action: document.getElementById('form-action').value,
        messages: parseInt(document.getElementById('form-messages').value) || 0,
        appointments: parseInt(document.getElementById('form-appointments').value) || 0,
        services: parseFloat(document.getElementById('form-services').value) || 0,
        subs: parseFloat(document.getElementById('form-subs').value) || 0,
        subsQtd: parseInt(document.getElementById('form-subs-qtd').value) || 0,
        sales: parseFloat(document.getElementById('form-sales').value) || 0,
        cancellations: parseInt(document.getElementById('form-cancellations').value) || 0
    };

    entries.push(newEntry);
    localStorage.setItem('gomez_club_entries', JSON.stringify(entries));
    
    renderTable();
    closeModal();

    // Sincronizar em background
    syncWithCloud(true);
}

function deleteEntry(id) {
    if (confirm('Deseja excluir este lançamento?')) {
        entries = entries.filter(e => e.id !== id);
        localStorage.setItem('gomez_club_entries', JSON.stringify(entries));
        renderTable();
        // Sincronizar em background
        syncWithCloud(true);
    }
}

function getFilteredData() {
    const month = document.getElementById('month-filter').value;
    if (!month) return entries;
    return entries.filter(e => e.date.startsWith(month));
}

// Renderização
function renderTable() {
    const filtered = getFilteredData().sort((a,b) => b.date.localeCompare(a.date));
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    filtered.forEach(entry => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(entry.date)}</td>
            <td>${entry.attendant}</td>
            <td><span class="badge ${entry.action.toLowerCase().replace(/\s/g, '-')}">${entry.action}</span></td>
            <td>${entry.messages}</td>
            <td>${entry.appointments}</td>
            <td>R$ ${(entry.services || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
            <td>R$ ${(entry.subs || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
            <td>R$ ${(entry.sales || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
            <td>${entry.cancellations || 0}</td>
            <td>
                <button onclick="deleteEntry(${entry.id})" class="btn-delete">Excluir</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

// Dashboard e Gráficos
function updateDashboard() {
    const data = getFilteredData();
    
    // KPIs
    const totalMessages = data.reduce((sum, e) => sum + (e.messages || 0), 0);
    const totalApps = data.reduce((sum, e) => sum + (e.appointments || 0), 0);
    const totalServices = data.reduce((sum, e) => sum + (e.services || 0), 0);
    const totalSubs = data.reduce((sum, e) => sum + (e.subs || 0), 0);
    const totalProducts = data.reduce((sum, e) => sum + (e.sales || 0), 0);
    const totalRevenue = totalServices + totalSubs + totalProducts;
    
    const convRate = totalMessages > 0 ? (totalApps / totalMessages) * 100 : 0;
    
    document.getElementById('kpi-conversion').innerText = `${convRate.toFixed(1)}%`;
    document.getElementById('kpi-revenue').innerText = `R$ ${totalRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-services').innerText = `R$ ${totalServices.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-subs').innerText = `R$ ${totalSubs.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-products').innerText = `R$ ${totalProducts.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-appointments').innerText = totalApps;

    // Atualizar Gráficos
    updateCharts(data);
}

function updateCharts(data) {
    // 1. Bar Chart (By Attendant)
    const attendants = [...new Set(entries.map(e => e.attendant))];
    const appsPerAttendant = attendants.map(att => {
        return data.filter(e => e.attendant === att).reduce((sum, e) => sum + e.appointments, 0);
    });

    renderChart('barChart', 'bar', {
        labels: attendants,
        datasets: [{
            label: 'Agendamentos',
            data: appsPerAttendant,
            backgroundColor: '#6366f1'
        }]
    });

    // 2. Pie Chart (By Action Type)
    const actions = [...new Set(entries.map(e => e.action))];
    const appsPerAction = actions.map(act => {
        return data.filter(e => e.action === act).reduce((sum, e) => sum + e.appointments, 0);
    });

    renderChart('pieChart', 'doughnut', {
        labels: actions,
        datasets: [{
            data: appsPerAction,
            backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444'],
            borderWidth: 0
        }]
    }, {
        plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } }
    });

    // 3. Line Chart (Weekly Evolution)
    // Agrupa por dia para simplificar a visão
    const last7Days = [];
    for(let i=6; i>=0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push(d.toISOString().split('T')[0]);
    }

    const dailyApps = last7Days.map(date => {
        return data.filter(e => e.date === date).reduce((sum, e) => sum + e.appointments, 0);
    });

    renderChart('lineChart', 'line', {
        labels: last7Days.map(d => formatDate(d).substring(0, 5)),
        datasets: [{
            label: 'Agendamentos Diários',
            data: dailyApps,
            borderColor: '#6366f1',
            tension: 0.4,
            fill: true,
            backgroundColor: 'rgba(99, 102, 241, 0.1)'
        }]
    });
}

function renderChart(id, type, data, options = {}) {
    if (charts[id]) charts[id].destroy();
    
    const ctx = document.getElementById(id).getContext('2d');
    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: '#94a3b8' } }
        },
        scales: type !== 'doughnut' ? {
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
            x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
        } : {}
    };

    charts[id] = new Chart(ctx, {
        type: type,
        data: data,
        options: { ...defaultOptions, ...options }
    });
}
