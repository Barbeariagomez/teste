// Supabase Configuration
const SUPABASE_URL = 'https://ufoogmuszlkrgjctezru.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmb29nbXVzemxrcmdqY3RlenJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTcxMzEsImV4cCI6MjA5MDQ5MzEzMX0.6M2GsqYccXdLh3rHY2FKsOimUiKhIUss2nxRWrRDYq4';

// Check if supabase library is loaded correctly
if (typeof supabase === 'undefined') {
    console.error('Erro: A biblioteca Supabase não foi carregada. Verifique se o script no index.html está correto.');
}

const supabaseClient = (typeof supabase !== 'undefined') ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Gerenciamento de Estado e Dados
let entries = [];
let attendants = [];
let charts = {};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
    setupRealtime();
});

async function initApp() {
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    document.getElementById('month-filter').value = currentMonth;
    
    // Tenta carregar atendentes de forma isolada
    try {
        await loadAttendants(); 
        updateAttendantSelects();
    } catch (err) {
        console.warn('Falha ao carregar atendentes. Verifique se a tabela exists:', err);
    }
    
    // Tenta carregar lançamentos de forma isolada
    try {
        await loadEntries();
    } catch (err) {
        console.error('Falha crítica ao carregar lançamentos:', err);
    }

    setupRealtime(); // Ativa escuta em tempo real
}

// Configuração do Real-time
function setupRealtime() {
    if (!supabaseClient) return;
    
    // Canal para Lançamentos
    supabaseClient
        .channel('public:lancamentos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos' }, (payload) => {
            console.log('Mudança detectada nos lançamentos:', payload);
            loadEntries();
        })
        .subscribe();

    // Canal para Atendentes
    supabaseClient
        .channel('public:atendentes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'atendentes' }, (payload) => {
            console.log('Mudança detectada nos atendentes:', payload);
            loadAttendants();
        })
        .subscribe();
}

async function loadAttendants() {
    if (!supabaseClient) {
        updateSyncStatus('offline', 'Biblioteca Supabase não encontrada');
        return;
    }
    try {
        const { data, error } = await supabaseClient
            .from('atendentes')
            .select('nome')
            .order('nome', { ascending: true });

        if (error) {
            console.error('Erro ao carregar atendentes:', error);
            if (error.code === '42P01') {
                updateSyncStatus('offline', 'Rode o SQL de Atendentes!');
            } else {
                updateSyncStatus('offline', 'Erro ao acessar Atendentes');
            }
            throw error;
        }
        attendants = data.map(a => a.nome);
        updateAttendantSelects();
        if (document.getElementById('staff-modal').style.display === 'flex') {
            renderStaffList();
        }
        updateSyncStatus('online');
    } catch (err) {
        console.error('Erro fatal loadAttendants:', err);
    }
}

async function loadEntries() {
    if (!supabaseClient) return;
    updateSyncStatus('syncing');
    try {
        const { data, error } = await supabaseClient
            .from('lancamentos')
            .select('*')
            .order('data', { ascending: false });

        if (error) {
            if (error.code === '42P01') {
                updateSyncStatus('offline', 'Tabela Faltando');
            } else {
                updateSyncStatus('offline', 'Erro de API');
            }
            throw error;
        }

        // Mapeia do banco para o padrão do JS
        entries = data.map(db => ({
            id: db.id,
            date: db.data,
            attendant: db.atendente,
            action: db.acao,
            messages: db.mensagens,
            appointments: db.agendamentos,
            services: parseFloat(db.servicos),
            subs: parseFloat(db.assinaturas),
            subsQtd: db.assinaturas_qtd,
            sales: parseFloat(db.vendas),
            cancellations: db.cancelamentos
        }));

        renderTable();
        updateDashboard();
        updateSyncStatus('online');
    } catch (err) {
        console.error('Erro ao carregar dados:', err);
        updateSyncStatus('offline', 'Erro de Carga');
    }
}

function updateSyncStatus(status, text = '') {
    const indicator = document.getElementById('cloud-status-indicator');
    if (!indicator) return;
    const statusText = indicator.querySelector('.status-text');
    
    indicator.className = `status-badge ${status}`;
    statusText.innerText = text || (status === 'online' ? 'Conectado (Nuvem)' : status === 'syncing' ? 'Sincronizando...' : 'Desconectado');
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
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => {
            if (li.dataset.tab) {
                document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                
                li.classList.add('active');
                const tabId = `tab-${li.dataset.tab}`;
                document.getElementById(tabId).classList.add('active');
                
                const titles = { 'lancamentos': 'Lançamentos Gomez Club', 'dashboard': 'Performance Gomez Club' };
                document.getElementById('page-title').innerText = titles[li.dataset.tab] || 'Pós-Venda';
                
                if (li.dataset.tab === 'dashboard') {
                    updateDashboard();
                }
            }
        });
    });

    const modal = document.getElementById('modal-container');
    document.getElementById('add-entry-btn').addEventListener('click', () => {
        modal.style.display = 'flex';
        document.getElementById('form-date').value = new Date().toISOString().split('T')[0];
    });

    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });
    
    const cancelBtn = document.querySelector('.cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    document.getElementById('entry-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveEntry();
    });

    document.getElementById('month-filter').addEventListener('change', () => {
        renderTable();
        updateDashboard();
    });

    const staffModal = document.getElementById('staff-modal');
    document.getElementById('manage-staff-btn').addEventListener('click', () => {
        renderStaffList();
        staffModal.style.display = 'flex';
    });

    const closeStaff = document.getElementById('close-staff-modal');
    if (closeStaff) closeStaff.addEventListener('click', () => staffModal.style.display = 'none');
    
    const saveStaff = document.getElementById('save-staff-btn');
    if (saveStaff) saveStaff.addEventListener('click', () => staffModal.style.display = 'none');
    
    document.getElementById('add-staff-btn').addEventListener('click', async () => {
        const nameInput = document.getElementById('new-staff-name');
        const name = nameInput.value.trim();
        if (name && !attendants.includes(name)) {
            try {
                const { error } = await supabaseClient
                    .from('atendentes')
                    .insert([{ nome: name }]);
                if (error) throw error;
                nameInput.value = '';
            } catch (err) {
                console.error('Erro ao adicionar atendente:', err);
                alert('Erro ao cadastrar atendente.');
            }
        }
    });

    document.getElementById('form-action').addEventListener('change', (e) => {
        const action = e.target.value;
        const groups = ['group-services', 'group-subs', 'group-sales', 'group-cancellations'];
        groups.forEach(id => document.getElementById(id).classList.remove('highlighted'));

        if (action === 'Venda de Assinatura') {
            document.getElementById('group-subs').classList.add('highlighted');
        } else if (action === 'Cancelamento') {
            document.getElementById('group-cancellations').classList.add('highlighted');
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

window.removeStaff = async function(index) {
    const name = attendants[index];
    if (confirm(`Remover ${name} da equipe?`)) {
        try {
            const { error } = await supabaseClient
                .from('atendentes')
                .delete()
                .eq('nome', name);
            if (error) throw error;
        } catch (err) {
            console.error('Erro ao remover:', err);
            alert('Não foi possível remover o atendente.');
        }
    }
};

function closeModal() {
    document.getElementById('modal-container').style.display = 'none';
    document.getElementById('entry-form').reset();
    const groups = ['group-services', 'group-subs', 'group-sales', 'group-cancellations'];
    groups.forEach(id => document.getElementById(id).classList.remove('highlighted'));
}

async function saveEntry() {
    if (!supabaseClient) {
        alert('O sistema está offline. Recarregue a página.');
        return;
    }
    updateSyncStatus('syncing');
    const newEntry = {
        id: Date.now(),
        data: document.getElementById('form-date').value,
        atendente: document.getElementById('form-attendant').value,
        acao: document.getElementById('form-action').value,
        mensagens: parseInt(document.getElementById('form-messages').value) || 0,
        agendamentos: parseInt(document.getElementById('form-appointments').value) || 0,
        servicos: parseFloat(document.getElementById('form-services').value) || 0,
        assinaturas: parseFloat(document.getElementById('form-subs').value) || 0,
        assinaturas_qtd: parseInt(document.getElementById('form-subs-qtd').value) || 0,
        vendas: parseFloat(document.getElementById('form-sales').value) || 0,
        cancelamentos: parseInt(document.getElementById('form-cancellations').value) || 0
    };

    try {
        const { error } = await supabaseClient
            .from('lancamentos')
            .insert([newEntry]);

        if (error) {
            console.error('Erro no Supabase:', error);
            if (error.code === '42P01') {
                alert('ERRO: A tabela "lancamentos" não existe no Supabase. Você rodou o script SQL no SQL Editor?');
            } else {
                alert('Erro ao salvar no banco: ' + error.message);
            }
            throw error;
        }
        
        closeModal();
    } catch (err) {
        console.error('Erro ao salvar:', err);
        updateSyncStatus('offline', 'Erro ao Salvar');
    }
}

window.deleteEntry = async function(id) {
    if (!supabaseClient) return;
    if (confirm('Deseja excluir este lançamento?')) {
        updateSyncStatus('syncing');
        try {
            const { error } = await supabaseClient
                .from('lancamentos')
                .delete()
                .eq('id', id);

            if (error) throw error;
        } catch (err) {
            console.error('Erro ao excluir:', err);
            alert('Não foi possível excluir do banco de dados.');
        }
    }
};

function getFilteredData() {
    const month = document.getElementById('month-filter').value;
    if (!month) return entries;
    return entries.filter(e => e.date.startsWith(month));
}

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
    if(!dateStr) return '--/--/----';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function updateDashboard() {
    const data = getFilteredData();
    const totalServices = data.reduce((sum, e) => sum + (e.services || 0), 0);
    const totalSubs = data.reduce((sum, e) => sum + (e.subs || 0), 0);
    const totalProducts = data.reduce((sum, e) => sum + (e.sales || 0), 0);
    const totalRevenue = totalServices + totalSubs + totalProducts;
    const totalMessages = data.reduce((sum, e) => sum + (e.messages || 0), 0);
    const totalApps = data.reduce((sum, e) => sum + (e.appointments || 0), 0);
    const convRate = totalMessages > 0 ? (totalApps / totalMessages) * 100 : 0;
    
    document.getElementById('kpi-revenue').innerText = `R$ ${totalRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-services').innerText = `R$ ${totalServices.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-subs').innerText = `R$ ${totalSubs.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-products').innerText = `R$ ${totalProducts.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-appointments').innerText = totalApps;
    document.getElementById('kpi-conversion').innerText = `${convRate.toFixed(1)}%`;

    updateCharts(data);
}

function updateCharts(data) {
    const attendantsList = [...new Set(entries.map(e => e.attendant))];
    const appsPerAttendant = attendantsList.map(att => {
        return data.filter(e => e.attendant === att).reduce((sum, e) => sum + e.appointments, 0);
    });

    renderChart('barChart', 'bar', {
        labels: attendantsList,
        datasets: [{ label: 'Agendamentos', data: appsPerAttendant, backgroundColor: '#6366f1' }]
    });

    const actions = [...new Set(entries.map(e => e.action))];
    const appsPerAction = actions.map(act => {
        return data.filter(e => e.action === act).reduce((sum, e) => sum + e.appointments, 0);
    });

    renderChart('pieChart', 'doughnut', {
        labels: actions,
        datasets: [{ data: appsPerAction, backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444'], borderWidth: 0 }]
    }, { plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } } });

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
    charts[id] = new Chart(ctx, {
        type: type,
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8' } } },
            scales: type !== 'doughnut' ? {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            } : {},
            ...options
        }
    });
}
