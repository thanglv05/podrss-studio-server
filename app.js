// State management
let showsList = [];
let activeShowId = '';
let githubConfig = {};
let activeUploadXHR = null; // To cancel upload if needed

// Scapbot API Key
const SCAPBOT_API_KEY = "a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5";

// Toast System helper
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fa-solid ${
        type === 'success' ? 'fa-circle-check' : 
        type === 'error' ? 'fa-circle-exclamation' : 
        type === 'info' ? 'fa-circle-info' : 'fa-triangle-exclamation'
    }"></i> <span>${message}</span>`;
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Remove after 3.5s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Helper to escape XML special characters
function escapeXML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Helper to strip HTML tags for plain text descriptions
function stripHTML(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '');
}

// Helper to convert plain URLs to clickable HTML links, keeping existing HTML links
function linkify(text) {
    if (!text) return '';
    if (text.includes('<a') || text.includes('</a>')) {
        return text;
    }
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
}

// Generate standard UUID
function generateGUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Convert date-local input value to RFC 2822 required by Apple Podcast
function toRFC2822(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const dayName = days[date.getDay()];
    const dayVal = String(date.getDate()).padStart(2, '0');
    const monthName = months[date.getMonth()];
    const year = date.getFullYear();
    
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    // Timezone Offset
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const absOffset = Math.abs(offset);
    const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const offsetMinutes = String(absOffset % 60).padStart(2, '0');
    
    return `${dayName}, ${dayVal} ${monthName} ${year} ${hours}:${minutes}:${seconds} ${sign}${offsetHours}${offsetMinutes}`;
}

// Tab Switching logic
window.switchTab = function(tabId) {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    if (tabId === 'podcast-meta') {
        tabBtns[0].classList.add('active');
        document.getElementById('podcast-meta-form').classList.add('active');
    } else if (tabId === 'github-config') {
        tabBtns[1].classList.add('active');
        document.getElementById('github-config-form').classList.add('active');
    } else if (tabId === 'mailbox-otp') {
        tabBtns[2].classList.add('active');
        document.getElementById('mailbox-otp-tab').classList.add('active');
        
        // Sync email from Meta form to Mailbox form
        const metaEmail = document.getElementById('show-owner-email').value.trim();
        document.getElementById('mb-email').value = metaEmail || 'backlinkpodcast@likepion.com';
    }
};

// Modal Audio Tab Switcher
window.selectAudioTab = function(tabName) {
    document.querySelectorAll('.modal-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.audio-tab-content').forEach(content => content.classList.remove('active'));
    
    const sizeDurationRow = document.getElementById('form-row-size-duration');
    const epAudioInput = document.getElementById('ep-audio');
    const epLengthInput = document.getElementById('ep-length');
    const epDurationInput = document.getElementById('ep-duration');
    const ttsText = document.getElementById('ep-tts-text');

    if (tabName === 'upload') {
        document.getElementById('btn-tab-upload').classList.add('active');
        document.getElementById('tab-content-upload').classList.add('active');
        sizeDurationRow.style.display = 'flex';
        epAudioInput.required = true;
        epLengthInput.required = true;
        epDurationInput.required = true;
        ttsText.required = false;
    } else if (tabName === 'tts') {
        document.getElementById('btn-tab-tts').classList.add('active');
        document.getElementById('tab-content-tts').classList.add('active');
        sizeDurationRow.style.display = 'none';
        epAudioInput.required = false;
        epLengthInput.required = false;
        epDurationInput.required = false;
        ttsText.required = true;
    } else if (tabName === 'url') {
        document.getElementById('btn-tab-url').classList.add('active');
        document.getElementById('tab-content-url').classList.add('active');
        sizeDurationRow.style.display = 'flex';
        epAudioInput.required = true;
        epLengthInput.required = true;
        epDurationInput.required = true;
        ttsText.required = false;
    }
};

// ==========================================
// HTTP API CALLS (CONNECT TO NODE.JS SERVER)
// ==========================================

// Load whole app data on startup
async function loadAppData() {
    try {
        // 1. Fetch GitHub Config
        const ghRes = await fetch('/api/github-config');
        if (ghRes.ok) {
            const ghData = await ghRes.json();
            githubConfig = ghData.status === 'success' ? ghData.data : {};
            // Fill inputs
            document.getElementById('gh-username').value = githubConfig.username || '';
            document.getElementById('gh-repo').value = githubConfig.repo || '';
            document.getElementById('gh-token').value = githubConfig.token || '';
            document.getElementById('gh-audio-path').value = githubConfig.audioPath || 'audio';
        }

        // 2. Fetch all Podcast Shows
        await fetchShows();
    } catch (err) {
        showToast("Lỗi khi kết nối đến Server Node.js cục bộ!", "error");
        console.error(err);
    }
}

// Fetch all shows list and populate selector dropdown
async function fetchShows(selectShowId = null) {
    try {
        const res = await fetch('/api/shows');
        if (res.ok) {
            const resData = await res.json();
            showsList = resData.status === 'success' ? resData.data : [];
            
            const selector = document.getElementById('active-channel-select');
            selector.innerHTML = '';
            
            if (showsList.length === 0) {
                selector.innerHTML = '<option value="">-- Chưa có kênh nào --</option>';
                activeShowId = '';
                clearPodcastMetaForm();
                renderEpisodes([]);
                return;
            }

            showsList.forEach(show => {
                const opt = document.createElement('option');
                opt.value = show.id;
                opt.textContent = `${show.title} (${show.id})`;
                selector.appendChild(opt);
            });

            // Set active show
            if (selectShowId && showsList.some(s => s.id === selectShowId)) {
                activeShowId = selectShowId;
            } else {
                // Get from localStorage or take first one
                const savedActiveId = localStorage.getItem('podrss_active_show_id');
                if (savedActiveId && showsList.some(s => s.id === savedActiveId)) {
                    activeShowId = savedActiveId;
                } else {
                    activeShowId = showsList[0].id;
                }
            }

            selector.value = activeShowId;
            localStorage.setItem('podrss_active_show_id', activeShowId);
            
            // Populate active show meta details and episodes
            populateShowDetails(activeShowId);
        }
    } catch (e) {
        console.error("Fetch shows error:", e);
    }
}

// Clear podcast meta form inputs
function clearPodcastMetaForm() {
    document.getElementById('show-id-display').value = '';
    document.getElementById('show-title').value = '';
    document.getElementById('show-author').value = '';
    document.getElementById('show-owner-name').value = '';
    document.getElementById('show-owner-email').value = '';
    document.getElementById('show-image').value = '';
    document.getElementById('show-link').value = '';
    document.getElementById('show-description').value = '';
    updateCoverPreview('');
}

// Populate Show Details on form
function populateShowDetails(showId) {
    const show = showsList.find(s => s.id === showId);
    if (!show) return;

    document.getElementById('show-id-display').value = show.id;
    document.getElementById('show-title').value = show.title;
    document.getElementById('show-author').value = show.author;
    document.getElementById('show-owner-name').value = show.ownerName;
    document.getElementById('show-owner-email').value = show.ownerEmail;
    document.getElementById('show-image').value = show.image;
    document.getElementById('show-link').value = show.link || '';
    document.getElementById('show-description').value = show.description;
    document.getElementById('show-language').value = show.language || 'vi';
    document.getElementById('show-explicit').value = show.explicit || 'no';
    document.getElementById('show-category').value = show.category || 'Society & Culture';
    
    updateCoverPreview(show.image);
    renderEpisodes(show.episodes || []);
    
    // Sync email display in Mailbox tab too
    document.getElementById('mb-email').value = show.ownerEmail;
}

// Render dynamic episodes list
function renderEpisodes(episodes) {
    const list = document.getElementById('episodes-list');
    const count = document.getElementById('episode-count');
    
    count.textContent = episodes.length;
    
    if (episodes.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-microphone-lines"></i>
                <p>Chưa có tập podcast nào.</p>
                <p class="sub-text">Hãy nhấn nút "Thêm Tập Mới" để tạo tập đầu tiên cho show của bạn.</p>
            </div>
        `;
        return;
    }
    
    list.innerHTML = '';
    episodes.forEach((ep, idx) => {
        const dateFormatted = new Date(ep.pubDate).toLocaleString('vi-VN', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        
        const card = document.createElement('div');
        card.className = 'episode-card';
        card.innerHTML = `
            <div class="episode-card-header">
                <div class="episode-card-info">
                    <h3 class="episode-title">${escapeXML(ep.title)}</h3>
                    <div class="episode-meta-badges">
                        <span class="badge badge-info"><i class="fa-regular fa-calendar"></i> ${dateFormatted}</span>
                        <span class="badge badge-success"><i class="fa-regular fa-clock"></i> ${ep.duration}</span>
                        <span class="badge badge-info"><i class="fa-solid fa-hdd"></i> ${(parseFloat(ep.fileSize) / (1024 * 1024)).toFixed(2)} MB</span>
                        ${ep.explicit === 'yes' ? '<span class="badge badge-danger">18+ (Explicit)</span>' : ''}
                        <span class="badge badge-info">${ep.type ? ep.type.toUpperCase() : 'FULL'}</span>
                    </div>
                </div>
            </div>
            <p class="episode-desc">${escapeXML(ep.description)}</p>
            <div class="episode-footer">
                <a href="${ep.audioUrl}" target="_blank" class="episode-audio-link" title="${ep.audioUrl}">
                    <i class="fa-solid fa-music"></i> ${ep.audioUrl}
                </a>
                <div class="episode-actions">
                    <button class="btn-icon edit" onclick="editEpisode('${ep.guid}')" title="Chỉnh sửa tập"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon delete" onclick="deleteEpisode('${ep.guid}')" title="Xóa tập"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

// Update active show fields to server (debounced / onchange)
async function saveActiveShowStateToServer() {
    if (!activeShowId) return;

    const data = {
        title: document.getElementById('show-title').value,
        author: document.getElementById('show-author').value,
        ownerName: document.getElementById('show-owner-name').value,
        ownerEmail: document.getElementById('show-owner-email').value,
        image: document.getElementById('show-image').value,
        link: document.getElementById('show-link').value,
        description: document.getElementById('show-description').value,
        language: document.getElementById('show-language').value,
        explicit: document.getElementById('show-explicit').value,
        category: document.getElementById('show-category').value
    };

    try {
        const res = await fetch(`/api/shows/${activeShowId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            // Update in local array too
            const idx = showsList.findIndex(s => s.id === activeShowId);
            if (idx !== -1) {
                showsList[idx] = { ...showsList[idx], ...data };
            }
            // Update selector display name just in case title changed
            const opt = document.querySelector(`#active-channel-select option[value="${activeShowId}"]`);
            if (opt) opt.textContent = `${data.title} (${activeShowId})`;
        }
    } catch (e) {
        console.error("Save show to server error:", e);
    }
}

// Save GitHub configuration to server
async function saveGithubConfigToServer() {
    const data = {
        username: document.getElementById('gh-username').value.trim(),
        repo: document.getElementById('gh-repo').value.trim(),
        token: document.getElementById('gh-token').value.trim(),
        audioPath: document.getElementById('gh-audio-path').value.trim()
    };

    try {
        const res = await fetch('/api/github-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            githubConfig = data;
        }
    } catch (e) {
        console.error("Save github config error:", e);
    }
}

// Update Cover Image preview
function updateCoverPreview(url) {
    const preview = document.getElementById('cover-preview');
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        preview.innerHTML = `<img src="${url}" onerror="this.outerHTML='<i class=\'fa-solid fa-triangle-exclamation\'></i>';">`;
    } else {
        preview.innerHTML = `<i class="fa-regular fa-image"></i>`;
    }
}

// Delete episode handler (API)
window.deleteEpisode = async function(guid) {
    if (!activeShowId) return;
    if (confirm("Bạn có chắc chắn muốn xóa tập podcast này khỏi danh sách?")) {
        try {
            const res = await fetch(`/api/shows/${activeShowId}/episodes/${guid}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                showToast("Đã xóa tập podcast thành công!");
                await fetchShows(activeShowId); // Reload
            }
        } catch (e) {
            showToast("Lỗi khi xóa tập: " + e.message, "error");
        }
    }
};

// Edit episode handler (triggers modal)
window.editEpisode = function(guid) {
    const show = showsList.find(s => s.id === activeShowId);
    if (!show) return;

    const ep = show.episodes.find(e => e.guid === guid);
    if (!ep) return;
    
    document.getElementById('modal-title').textContent = "Chỉnh sửa tập podcast";
    document.getElementById('episode-index').value = guid; // Use GUID as identifier
    
    document.getElementById('ep-title').value = ep.title || '';
    document.getElementById('ep-audio').value = ep.audioUrl || '';
    document.getElementById('ep-length').value = ep.fileSize || '';
    document.getElementById('ep-duration').value = ep.duration || '';
    document.getElementById('ep-pubdate').value = ep.pubDate || '';
    document.getElementById('ep-type').value = ep.type || 'full';
    document.getElementById('ep-explicit').value = ep.explicit || 'no';
    document.getElementById('ep-guid').value = ep.guid || '';
    document.getElementById('ep-description').value = ep.description || '';
    
    // Choose tab 'url' when editing to show details
    selectAudioTab('url');
    document.getElementById('tts-progress-container').style.display = 'none';
    document.getElementById('ep-tts-text').value = '';

    openModal();
};

// Modal helpers
const modal = document.getElementById('episode-modal');
function openModal() {
    modal.style.display = "flex";
    document.getElementById('upload-progress-container').style.display = 'none';
    document.getElementById('tts-progress-container').style.display = 'none';
    document.getElementById('ep-audio-file').value = '';
}
function closeModal() {
    if (activeUploadXHR) {
        activeUploadXHR.abort();
        activeUploadXHR = null;
    }
    modal.style.display = "none";
    document.getElementById('episode-form').reset();
    document.getElementById('episode-index').value = '';
    document.getElementById('ep-tts-text').value = '';
    document.getElementById('modal-title').textContent = "Thêm Tập Podcast Mới";
}

// SCAPBOT EMAIL INTEGRATION LOGIC
async function fetchEmailsFromScapbot() {
    const email = document.getElementById('mb-email').value.trim();
    const fromVal = document.getElementById('mb-from').value.trim();
    const subjectVal = document.getElementById('mb-subject').value.trim();
    
    if (!email) {
        showToast("Hòm thư trống! Vui lòng cấu hình email của show.", "warning");
        return;
    }

    const mailboxList = document.getElementById('mailbox-list');
    mailboxList.innerHTML = `
        <div class="mail-empty-state">
            <i class="fa-solid fa-sync fa-spin" style="font-size: 28px; color: var(--color-accent);"></i>
            <p style="margin-top: 8px;">Đang quét hộp thư...</p>
        </div>
    `;

    const url = `https://checkmail.scapbot.net/workspace/emails?email=${encodeURIComponent(email)}&from=${encodeURIComponent(fromVal)}&subject=${encodeURIComponent(subjectVal)}`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-API-Key': SCAPBOT_API_KEY,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP Status ${response.status}`);
        }

        const emails = await response.json();
        renderMailbox(emails);
        showToast("Đã cập nhật hộp thư mới nhất!");
    } catch (err) {
        console.error("Scapbot Fetch Mail Error:", err);
        mailboxList.innerHTML = `
            <div class="mail-empty-state">
                <i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger); font-size: 28px;"></i>
                <p>Lỗi kết nối hòm thư.</p>
                <p class="sub-text">${err.message}</p>
            </div>
        `;
        showToast("Lỗi khi đọc email: " + err.message, "error");
    }
}

function renderMailbox(emails) {
    const listContainer = document.getElementById('mailbox-list');
    
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
        listContainer.innerHTML = `
            <div class="mail-empty-state">
                <i class="fa-regular fa-envelope"></i>
                <p>Không tìm thấy thư nào.</p>
                <p class="sub-text">Hộp thư chưa nhận được thư.</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = '';
    emails.forEach((mail) => {
        const card = document.createElement('div');
        card.className = 'mail-card';
        const timeStr = mail.date ? new Date(mail.date).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}) : 'Vừa xong';
        
        const combinedText = `${mail.subject} ${mail.body || ''} ${mail.html || ''}`;
        const otpMatch = combinedText.match(/\b\d{4,8}\b/);
        const otpCode = otpMatch ? otpMatch[0] : null;

        let otpHtml = '';
        if (otpCode) {
            otpHtml = `
                <div class="mail-otp-box" onclick="event.stopPropagation();">
                    <div>
                        <span class="otp-label">Mã OTP Phát hiện</span>
                        <div class="otp-code">${otpCode}</div>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="copyOTP('${otpCode}')">
                        <i class="fa-regular fa-copy"></i> Copy
                    </button>
                </div>
            `;
        }

        const mailBody = mail.body || "Thư không chứa nội dung văn bản thô.";

        card.innerHTML = `
            <div class="mail-card-header">
                <span class="mail-from" title="${escapeXML(mail.from)}"><i class="fa-solid fa-circle-user"></i> ${escapeXML(mail.from)}</span>
                <span class="mail-date">${timeStr}</span>
            </div>
            <div class="mail-subject">${escapeXML(mail.subject)}</div>
            ${otpHtml}
            <div class="mail-body-preview">${escapeXML(mailBody)}</div>
        `;

        card.addEventListener('click', function() {
            this.classList.toggle('expanded');
        });

        listContainer.appendChild(card);
    });
}

window.copyOTP = function(code) {
    navigator.clipboard.writeText(code)
        .then(() => showToast(`Đã copy mã OTP: ${code}`))
        .catch(err => showToast("Lỗi copy: " + err, "error"));
};

// Convert file to base64
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64Str = reader.result.split(',')[1];
            resolve(base64Str);
        };
        reader.onerror = error => reject(error);
    });
}

// Handle Audio upload via API to GitHub
async function handleAudioFileUpload(file) {
    const { username, repo, token, audioPath } = githubConfig;
    if (!username || !repo || !token) {
        showToast("Vui lòng cấu hình GitHub Auto ở Sidebar trước khi upload!", "error");
        switchTab('github-config');
        closeModal();
        return;
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const allowed = ['mp3', 'm4a', 'wav', 'ogg', 'mpeg'];
    if (!allowed.includes(ext)) {
        showToast("Định dạng file không được hỗ trợ!", "error");
        return;
    }

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 100) {
        showToast(`File dung lượng lớn (${sizeMB.toFixed(1)}MB). Giới hạn 100MB!`, "error");
        return;
    }

    const progressContainer = document.getElementById('upload-progress-container');
    const progressBarFill = document.getElementById('upload-progress-bar');
    const statusText = document.getElementById('upload-status-text');
    
    progressContainer.style.display = 'block';
    statusText.textContent = "Đang mã hóa âm thanh sang base64...";
    progressBarFill.style.width = '0%';
    progressBarFill.textContent = '0%';

    try {
        const base64Str = await getBase64(file);
        statusText.textContent = "Bắt đầu truyền dữ liệu lên GitHub...";
        
        const timestamp = Math.floor(Date.now() / 1000);
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueFilename = `${timestamp}_${safeName}`;
        
        const apiPath = `${audioPath}/${uniqueFilename}`;
        const url = `https://api.github.com/repos/${username}/${repo}/contents/${apiPath}`;
        
        const xhr = new XMLHttpRequest();
        activeUploadXHR = xhr;
        
        xhr.open('PUT', url, true);
        xhr.setRequestHeader('Authorization', `token ${token}`);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');
        
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressBarFill.style.width = `${percent}%`;
                progressBarFill.textContent = `${percent}%`;
                if (percent === 100) {
                    statusText.textContent = "GitHub đang xử lý lưu trữ file...";
                } else {
                    statusText.textContent = `Đang gửi dữ liệu: ${percent}% (${(e.loaded / (1024*1024)).toFixed(1)}MB)`;
                }
            }
        };
        
        xhr.onload = function() {
            activeUploadXHR = null;
            if (xhr.status === 200 || xhr.status === 201) {
                document.getElementById('ep-length').value = file.size;
                
                const cdnUrl = `https://${username}.github.io/${repo}/${audioPath}/${uniqueFilename}`;
                document.getElementById('ep-audio').value = cdnUrl;
                
                try {
                    const audioHelper = new Audio(URL.createObjectURL(file));
                    audioHelper.onloadedmetadata = function() {
                        const seconds = Math.round(audioHelper.duration);
                        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
                        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
                        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
                        document.getElementById('ep-duration').value = `${h}:${m}:${s}`;
                        showToast("Đã tự động tính thời lượng tập tin!");
                    };
                } catch (durErr) {}

                statusText.textContent = "Tải lên hoàn tất!";
                progressBarFill.style.width = '100%';
                progressBarFill.textContent = '100%';
                showToast("Tải file lên GitHub thành công!");
            } else {
                let errMsg = "Lỗi không xác định";
                try {
                    const err = JSON.parse(xhr.responseText);
                    errMsg = err.message;
                } catch (e) {}
                statusText.textContent = "Lỗi: " + errMsg;
                showToast("Lỗi khi tải file lên: " + errMsg, "error");
            }
        };
        
        xhr.onerror = function() {
            activeUploadXHR = null;
            statusText.textContent = "Lỗi kết nối mạng.";
            showToast("Lỗi kết nối mạng khi tải lên GitHub!", "error");
        };
        
        const body = {
            message: `Upload episode audio: ${uniqueFilename}`,
            content: base64Str
        };
        xhr.send(JSON.stringify(body));
        
    } catch (err) {
        statusText.textContent = "Lỗi: " + err.message;
        showToast("Lỗi: " + err.message, "error");
        activeUploadXHR = null;
    }
}

// Generate XML content based on state (client preview only)
function buildXMLPreview() {
    const show = showsList.find(s => s.id === activeShowId);
    if (!show) return null;
    
    // Simulate what server would do
    const showLink = show.link || `https://${githubConfig.username}.github.io/${githubConfig.repo}`;
    const gitXmlPath = `${show.id}/feed.xml`;
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" 
     xmlns:content="http://purl.org/rss/1.0/modules/content/" 
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <atom:link href="${escapeXML(showLink + '/' + gitXmlPath)}" rel="self" type="application/rss+xml" />
    <title>${escapeXML(show.title)}</title>
    <description>${escapeXML(show.description)}</description>
    <link>${escapeXML(showLink)}</link>
    <language>${escapeXML(show.language)}</language>
    <copyright>Copyright © ${new Date().getFullYear()} ${escapeXML(show.author)}</copyright>
    
    <itunes:author>${escapeXML(show.author)}</itunes:author>
    <itunes:type>episodic</itunes:type>
    <itunes:summary>${escapeXML(show.description)}</itunes:summary>
    <itunes:explicit>${escapeXML(show.explicit)}</itunes:explicit>
    
    <itunes:owner>
      <itunes:name>${escapeXML(show.ownerName)}</itunes:name>
      <itunes:email>${escapeXML(show.ownerEmail)}</itunes:email>
    </itunes:owner>
    
    <itunes:image href="${escapeXML(show.image)}" />
    
    <itunes:category text="${escapeXML(show.category)}" />
`;

    const episodes = show.episodes || [];
    episodes.forEach(ep => {
        const cleanDesc = stripHTML(ep.description);
        const htmlDesc = linkify(ep.description);
        xml += `
    <item>
      <title>${escapeXML(ep.title)}</title>
      <description>${escapeXML(cleanDesc)}</description>
      <content:encoded><![CDATA[${htmlDesc}]]></content:encoded>
      <pubDate>${toRFC2822(ep.pubDate)}</pubDate>
      <enclosure url="${escapeXML(ep.audioUrl)}" length="${ep.fileSize}" type="${ep.mimeType}" />
      <guid isPermaLink="false">${escapeXML(ep.guid)}</guid>
      <itunes:duration>${escapeXML(ep.duration)}</itunes:duration>
      <itunes:explicit>${escapeXML(ep.explicit)}</itunes:explicit>
      <itunes:episodeType>${escapeXML(ep.type)}</itunes:episodeType>
      <itunes:summary>${escapeXML(cleanDesc)}</itunes:summary>
    </item>`;
    });

    xml += `
  </channel>
</rss>`;

    return xml;
}

// Event Listeners Setup
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial Load from server APIs
    loadAppData();
    
    // Toggle Token visibility
    document.getElementById('btn-toggle-token').addEventListener('click', function() {
        const tokenInput = document.getElementById('gh-token');
        const icon = this.querySelector('i');
        if (tokenInput.type === 'password') {
            tokenInput.type = 'text';
            icon.className = 'fa-regular fa-eye';
        } else {
            tokenInput.type = 'password';
            icon.className = 'fa-regular fa-eye-slash';
        }
    });

    // 2. Channel Selector Dropdown Switch
    document.getElementById('active-channel-select').addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
            activeShowId = val;
            localStorage.setItem('podrss_active_show_id', val);
            populateShowDetails(val);
        }
    });

    // 3. Modals Controls for Channels
    const chanModal = document.getElementById('channel-modal');
    document.getElementById('btn-create-channel').addEventListener('click', () => {
        chanModal.style.display = 'flex';
    });
    document.getElementById('btn-close-channel-modal').addEventListener('click', () => {
        chanModal.style.display = 'none';
        document.getElementById('channel-form').reset();
    });
    document.getElementById('btn-cancel-channel-modal').addEventListener('click', () => {
        chanModal.style.display = 'none';
        document.getElementById('channel-form').reset();
    });

    // Channel Form Submit (Create New Channel Show)
    document.getElementById('channel-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const data = {
            title: document.getElementById('chan-title').value.trim(),
            author: document.getElementById('chan-author').value.trim(),
            ownerName: document.getElementById('chan-owner-name').value.trim(),
            ownerEmail: document.getElementById('chan-owner-email').value.trim(),
            image: document.getElementById('chan-image').value.trim(),
            description: document.getElementById('chan-description').value.trim(),
            language: document.getElementById('chan-language').value,
            category: document.getElementById('chan-category').value,
            explicit: 'no'
        };

        try {
            const res = await fetch('/api/shows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                const resData = await res.json();
                const newShow = resData.data;
                showToast(`Kênh ${newShow.title} đã được khởi tạo!`);
                chanModal.style.display = 'none';
                document.getElementById('channel-form').reset();
                
                // Reload list and set newly created show as active
                await fetchShows(newShow.id);
            } else {
                const err = await res.json();
                showToast("Lỗi: " + (err.message || err.error), "error");
            }
        } catch (err) {
            showToast("Lỗi mạng khi khởi tạo kênh!", "error");
        }
    });

    // Delete Podcast Show
    document.getElementById('btn-delete-channel').addEventListener('click', async () => {
        if (!activeShowId) return;
        const currentShow = showsList.find(s => s.id === activeShowId);
        
        if (confirm(`Bạn có chắc chắn muốn XÓA TOÀN BỘ kênh ${currentShow.title} (ID: ${activeShowId}) không?\nHành động này không thể hoàn tác!`)) {
            try {
                const res = await fetch(`/api/shows/${activeShowId}`, { method: 'DELETE' });
                if (res.ok) {
                    showToast("Đã xóa kênh podcast thành công!");
                    localStorage.removeItem('podrss_active_show_id');
                    await fetchShows(); // Reload
                }
            } catch (e) {
                showToast("Lỗi khi xóa kênh: " + e.message, "error");
            }
        }
    });

    // 4. Change detection on inputs to auto-save Show details
    const showInputs = document.querySelectorAll('#podcast-meta-form input, #podcast-meta-form textarea, #podcast-meta-form select');
    showInputs.forEach(input => {
        input.addEventListener('change', saveActiveShowStateToServer);
    });

    // 5. Change detection on GitHub settings to save
    const ghInputs = document.querySelectorAll('#github-config-form input');
    ghInputs.forEach(input => {
        input.addEventListener('change', saveGithubConfigToServer);
    });

    document.getElementById('show-image').addEventListener('input', (e) => {
        updateCoverPreview(e.target.value);
        saveActiveShowStateToServer();
    });

    // Test GitHub Connection on client side
    document.getElementById('btn-test-github').addEventListener('click', async () => {
        await saveGithubConfigToServer();
        const { username, repo, token } = githubConfig;
        
        if (!username || !repo || !token) {
            showToast("Vui lòng điền đầy đủ Tên, Repo và Token GitHub!", "warning");
            return;
        }

        showToast("Đang kiểm tra kết nối tới GitHub...", "info");
        const url = `https://api.github.com/repos/${username}/${repo}`;
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                showToast(`Kết nối thành công! Kho: ${data.full_name}`, "success");
            } else {
                const err = await response.json();
                showToast(`Kết nối thất bại: ${err.message}`, "error");
            }
        } catch (e) {
            showToast("Lỗi mạng khi kết nối tới GitHub API!", "error");
        }
    });

    // Scapbot Fetch Mail Button event
    document.getElementById('btn-fetch-emails').addEventListener('click', fetchEmailsFromScapbot);

    // Audio upload areas
    const uploadArea = document.getElementById('audio-upload-area');
    const audioFileInput = document.getElementById('ep-audio-file');
    uploadArea.addEventListener('click', () => audioFileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--color-accent)';
        uploadArea.style.backgroundColor = 'rgba(124, 93, 250, 0.08)';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--border-color)';
        uploadArea.style.backgroundColor = 'var(--bg-main)';
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border-color)';
        uploadArea.style.backgroundColor = 'var(--bg-main)';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleAudioFileUpload(files[0]);
        }
    });
    audioFileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            handleAudioFileUpload(files[0]);
        }
    });

    // Cancel upload button
    document.getElementById('btn-cancel-upload').addEventListener('click', () => {
        if (activeUploadXHR) {
            activeUploadXHR.abort();
            activeUploadXHR = null;
            document.getElementById('upload-progress-container').style.display = 'none';
            document.getElementById('ep-audio-file').value = '';
            showToast("Đã hủy tiến trình tải lên.", "warning");
        }
    });

    // Modal Control buttons
    document.getElementById('btn-add-episode').addEventListener('click', () => {
        if (!activeShowId) {
            showToast("Vui lòng khởi tạo Kênh Podcast trước khi thêm tập!", "warning");
            return;
        }
        document.getElementById('modal-title').textContent = "Thêm Tập Podcast Mới";
        document.getElementById('episode-index').value = '';
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('ep-pubdate').value = now.toISOString().slice(0, 16);
        document.getElementById('ep-guid').value = generateGUID();
        
        // Reset tabs to default (upload) when opening
        selectAudioTab('upload');
        document.getElementById('tts-progress-container').style.display = 'none';
        document.getElementById('ep-tts-text').value = '';
        document.getElementById('btn-generate-tts').disabled = false;
        
        openModal();
    });
    
    document.getElementById('btn-close-modal').addEventListener('click', closeModal);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);

    // Modal Audio Source Tab Switching Events
    document.getElementById('btn-tab-upload').addEventListener('click', () => selectAudioTab('upload'));
    document.getElementById('btn-tab-tts').addEventListener('click', () => selectAudioTab('tts'));
    document.getElementById('btn-tab-url').addEventListener('click', () => selectAudioTab('url'));

    // Handle TTS Auto Generation & Publication (1-Click Atomic Operation)
    document.getElementById('btn-generate-tts').addEventListener('click', async () => {
        if (!activeShowId) return;

        const title = document.getElementById('ep-title').value.trim();
        const text = document.getElementById('ep-tts-text').value.trim();
        
        if (!title) {
            showToast("Vui lòng điền Tiêu đề tập trước!", "warning");
            document.getElementById('ep-title').focus();
            return;
        }

        if (!text) {
            showToast("Vui lòng điền Văn bản cần đọc!", "warning");
            document.getElementById('ep-tts-text').focus();
            return;
        }

        // Show loading progress
        const ttsBtn = document.getElementById('btn-generate-tts');
        const progressContainer = document.getElementById('tts-progress-container');
        const statusText = document.getElementById('tts-status-text');

        ttsBtn.disabled = true;
        progressContainer.style.display = 'block';
        statusText.textContent = "Đang chuyển văn bản thành giọng nói và upload lên GitHub...";

        try {
            const res = await fetch(`/api/shows/${activeShowId}/publish-tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, text })
            });

            if (res.ok) {
                const resData = await res.json();
                const epData = resData.data;
                showToast("Đã sinh giọng nói và xuất bản lên GitHub thành công!", "success");
                closeModal();
                
                // Fetch updated shows and episodes
                await fetchShows(activeShowId);
                
                // Show final alert link
                alert(`XUẤT BẢN TTS THÀNH CÔNG!\n\nTập podcast mới đã được tạo và đẩy lên GitHub.\nLink âm thanh: ${epData.audioUrl}\nLink RSS Feed cập nhật:\n${epData.rssUrl}\n\n(Lưu ý: Chờ 1-2 phút để GitHub Pages cập nhật file)`);
            } else {
                const err = await res.json();
                showToast("Lỗi: " + (err.message || err.error), "error");
                ttsBtn.disabled = false;
                progressContainer.style.display = 'none';
            }
        } catch (err) {
            showToast("Lỗi mạng khi xử lý TTS!", "error");
            console.error(err);
            ttsBtn.disabled = false;
            progressContainer.style.display = 'none';
        }
    });

    // Save/Update Episode Form Submission
    document.getElementById('episode-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!activeShowId) return;
        
        const indexStr = document.getElementById('episode-index').value; // Contains GUID if editing
        const title = document.getElementById('ep-title').value.trim();
        const audioUrl = document.getElementById('ep-audio').value.trim();
        const fileSize = document.getElementById('ep-length').value;
        const duration = document.getElementById('ep-duration').value.trim();
        const pubDate = document.getElementById('ep-pubdate').value;
        const type = document.getElementById('ep-type').value;
        const explicit = document.getElementById('ep-explicit').value;
        const guid = document.getElementById('ep-guid').value.trim() || generateGUID();
        const description = document.getElementById('ep-description').value.trim();
        
        if (!title || !audioUrl || !fileSize || !duration || !pubDate || !description) {
            showToast("Vui lòng điền đầy đủ các thông tin bắt buộc!", "error");
            return;
        }

        const episodeData = {
            guid, title, audioUrl, fileSize, duration, pubDate, explicit, type, description
        };

        try {
            let res;
            if (indexStr === '') {
                // POST Add new episode
                res = await fetch(`/api/shows/${activeShowId}/episodes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(episodeData)
                });
                if (res.ok) showToast("Đã thêm tập podcast mới!");
            } else {
                // PUT Update episode
                res = await fetch(`/api/shows/${activeShowId}/episodes/${indexStr}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(episodeData)
                });
                if (res.ok) showToast("Đã cập nhật thông tin tập!");
            }

            if (res.ok) {
                await fetchShows(activeShowId); // Reload UI
                closeModal();
            } else {
                const err = await res.json();
                showToast("Lỗi: " + (err.message || err.error), "error");
            }
        } catch (err) {
            showToast("Lỗi mạng khi lưu tập podcast!", "error");
        }
    });

    // Sinh XML Feed Preview on Client
    document.getElementById('btn-export-xml').addEventListener('click', () => {
        const xml = buildXMLPreview();
        if (xml) {
            const preview = document.getElementById('xml-code');
            preview.textContent = xml;
            preview.className = "xml-code language-xml";
            
            document.getElementById('btn-copy-xml').removeAttribute('disabled');
            document.getElementById('btn-download-xml').removeAttribute('disabled');
            showToast("Đã sinh mã XML RSS xem trước thành công!");
        }
    });

    // Copy XML
    document.getElementById('btn-copy-xml').addEventListener('click', () => {
        const xml = document.getElementById('xml-code').textContent;
        navigator.clipboard.writeText(xml)
            .then(() => showToast("Đã copy XML vào Clipboard!"))
            .catch(err => showToast("Lỗi khi copy: " + err, "error"));
    });

    // Download XML
    document.getElementById('btn-download-xml').addEventListener('click', () => {
        const xml = document.getElementById('xml-code').textContent;
        const blob = new Blob([xml], { type: 'application/rss+xml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'feed.xml';
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
        showToast("Bắt đầu tải xuống file feed.xml!");
    });

    // Backup JSON (Export database)
    document.getElementById('btn-export-json').addEventListener('click', async () => {
        try {
            // Fetch database directly from server to download
            const res = await fetch('/api/shows');
            if (res.ok) {
                const data = await res.json();
                const dataStr = JSON.stringify(data, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `podcast_database_backup.json`;
                document.body.appendChild(a);
                a.click();
                
                setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                }, 0);
                showToast("Đã xuất tệp JSON cơ sở dữ liệu!");
            }
        } catch (e) {
            showToast("Lỗi khi tải dữ liệu backup: " + e.message, "error");
        }
    });

    // Import JSON (Backup restore)
    document.getElementById('btn-import-json').addEventListener('click', () => {
        document.getElementById('file-import-json').click();
    });

    document.getElementById('file-import-json').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(evt) {
            try {
                const parsed = JSON.parse(evt.target.result);
                // Simple validation (array of shows or object database)
                showToast("Tính năng import JSON đang chuyển giao. Đang đồng bộ dữ liệu...", "info");
                
                // Let user import one-by-one by creating shows
                const importedShows = Array.isArray(parsed) ? parsed : Object.values(parsed.shows || parsed);
                
                for (const show of importedShows) {
                    const res = await fetch('/api/shows', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(show)
                    });
                    if (res.ok) {
                        const resData = await res.json();
                        const newShow = resData.data;
                        // Import episodes
                        if (show.episodes && show.episodes.length > 0) {
                            for (const ep of show.episodes) {
                                await fetch(`/api/shows/${newShow.id}/episodes`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(ep)
                                });
                            }
                        }
                    }
                }
                
                showToast("Đã nhập dữ liệu JSON thành công!");
                await fetchShows();
            } catch (err) {
                showToast("Lỗi nhập JSON: " + err.message, "error");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    // Quét file
    document.getElementById('btn-fetch-audio').addEventListener('click', async () => {
        const url = document.getElementById('ep-audio').value.trim();
        if (!url) {
            showToast("Vui lòng điền URL tệp âm thanh trước!", "warning");
            return;
        }

        showToast("Đang quét tệp âm thanh để lấy dung lượng...", "info");
        try {
            const response = await fetch(url, { method: 'HEAD' });
            if (response.ok) {
                const size = response.headers.get('content-length');
                if (size) {
                    document.getElementById('ep-length').value = size;
                    showToast(`Quét thành công! Dung lượng: ${(parseInt(size) / (1024 * 1024)).toFixed(2)} MB`);
                } else {
                    showToast("Không đọc được Header Content-Length. Vui lòng tự nhập thủ công.", "warning");
                }
            } else {
                throw new Error("HTTP Status " + response.status);
            }
        } catch (err) {
            showToast("Lỗi CORS hoặc không thể kết nối trực tiếp. Vui lòng tự điền dung lượng thủ công.", "warning");
        }
    });

    // PUBLISH SHOW TO GITHUB (via Server HTTP API - 1 Click)
    document.getElementById('btn-publish-github').addEventListener('click', async () => {
        if (!activeShowId) {
            showToast("Chưa chọn Kênh Podcast để xuất bản!", "warning");
            return;
        }

        const show = showsList.find(s => s.id === activeShowId);
        if (!show) return;

        showToast(`Đang chuẩn bị xuất bản kênh: ${show.title}...`, "info");

        try {
            // Trigger server publication API
            const res = await fetch(`/api/shows/${activeShowId}/publish`, {
                method: 'POST'
            });

            if (res.ok) {
                const resData = await res.json();
                const data = resData.data;
                showToast("Đồng bộ thành công lên GitHub Pages!", "success");
                
                // Show preview XML on screen
                const xmlPreview = buildXMLPreview();
                if (xmlPreview) {
                    const preview = document.getElementById('xml-code');
                    preview.textContent = xmlPreview;
                    preview.className = "xml-code language-xml";
                    document.getElementById('btn-copy-xml').removeAttribute('disabled');
                    document.getElementById('btn-download-xml').removeAttribute('disabled');
                }

                alert(`XUẤT BẢN THÀNH CÔNG!\n\nKênh Podcast: ${show.title}\nLink RSS Feed chính thức của bạn:\n${data.rssUrl}\n\n(Lưu ý: Mất khoảng 1-2 phút để GitHub Pages kích hoạt link mới. Hãy copy link này nộp lên Spotify/Apple Podcasts)`);
            } else {
                const err = await res.json();
                showToast("Lỗi: " + (err.message || err.error), "error");
            }
        } catch (e) {
            showToast("Lỗi mạng khi kết nối đến Server để xuất bản!", "error");
            console.error(e);
        }
    });
});
