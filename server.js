const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

// Serve static web interface
app.use(express.static(__dirname));

// Helper functions for Database read/write
function readDb() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            // Initialize empty database
            const initData = { githubConfig: { username: '', repo: '', token: '', audioPath: 'audio' }, shows: {} };
            fs.writeFileSync(DB_FILE, JSON.stringify(initData, null, 2), 'utf8');
            return initData;
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Error reading database:", e);
        return { githubConfig: { username: '', repo: '', token: '', audioPath: 'audio' }, shows: {} };
    }
}

function writeDb(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error("Error writing database:", e);
        return false;
    }
}

// Helper to generate Short Random ID (like show_8f2d9c7a)
function generateRandomId() {
    return 'show_' + Math.random().toString(36).substring(2, 10);
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

// Convert date-local input to RFC 2822 for Apple Podcast
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
    
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const absOffset = Math.abs(offset);
    const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const offsetMinutes = String(absOffset % 60).padStart(2, '0');
    
    return `${dayName}, ${dayVal} ${monthName} ${year} ${hours}:${minutes}:${seconds} ${sign}${offsetHours}${offsetMinutes}`;
}

// Helper to call GitHub API using native Node.js 'https' module
function callGithubAPI(ghConfig, apiPath, method, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${ghConfig.username}/${ghConfig.repo}/contents/${apiPath}`,
            method: method,
            headers: {
                'Authorization': `token ${ghConfig.token}`,
                'User-Agent': 'NodeJS-Express-Server',
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                let parsedData = {};
                try {
                    parsedData = JSON.parse(data);
                } catch (e) {
                    parsedData = { raw: data };
                }

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ status: res.statusCode, data: parsedData });
                } else {
                    reject({ status: res.statusCode, message: parsedData.message || "GitHub API Error" });
                }
            });
        });

        req.on('error', (e) => reject({ status: 500, message: e.message }));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

// Helper to send standard responses
function sendSuccess(res, data = null, message = "Thao tác thành công", statusCode = 200) {
    return res.status(statusCode).json({
        status: "success",
        message: message,
        data: data
    });
}

function sendError(res, message = "Thao tác thất bại", statusCode = 400) {
    return res.status(statusCode).json({
        status: "error",
        message: message
    });
}

// ==========================================
// HTTP API ENDPOINTS
// ==========================================

// 1. Get GitHub Configuration
app.get('/api/github-config', (req, res) => {
    const db = readDb();
    sendSuccess(res, db.githubConfig || {}, "Lấy cấu hình GitHub thành công");
});

// 2. Save GitHub Configuration
app.post('/api/github-config', (req, res) => {
    const db = readDb();
    const { username, repo, token, audioPath } = req.body;
    
    db.githubConfig = {
        username: username ? username.trim() : '',
        repo: repo ? repo.trim() : '',
        token: token ? token.trim() : '',
        audioPath: audioPath ? audioPath.trim().replace(/^\/+|\/+$/g, '') : 'audio'
    };
    
    writeDb(db);
    sendSuccess(res, db.githubConfig, "Cấu hình GitHub đã được lưu cục bộ!");
});

// 3. Get all Podcast Shows (Channels)
app.get('/api/shows', (req, res) => {
    const db = readDb();
    sendSuccess(res, Object.values(db.shows || {}), "Lấy danh sách kênh thành công");
});

// 4. Create new Podcast Show (Channel)
app.post('/api/shows', (req, res) => {
    const db = readDb();
    const { title, author, ownerName, ownerEmail, image, link, description, language, explicit, category } = req.body;
    
    if (!title || !author || !ownerName || !ownerEmail || !image || !description) {
        return sendError(res, "Thiếu thông tin bắt buộc!");
    }

    const showId = generateRandomId();
    
    // Auto-generate home link if empty
    let finalLink = link;
    if (!finalLink && db.githubConfig.username && db.githubConfig.repo) {
        finalLink = `https://${db.githubConfig.username}.github.io/${db.githubConfig.repo}`;
    }

    const newShow = {
        id: showId,
        title: title.trim(),
        author: author.trim(),
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        image: image.trim(),
        link: finalLink ? finalLink.trim() : '',
        description: description.trim(),
        language: language || 'vi',
        explicit: explicit || 'no',
        category: category || 'Society & Culture',
        episodes: []
    };

    db.shows[showId] = newShow;
    writeDb(db);
    
    sendSuccess(res, newShow, "Khởi tạo kênh thành công", 201);
});

// 5. Update Podcast Show info
app.put('/api/shows/:showId', (req, res) => {
    const db = readDb();
    const { showId } = req.params;
    const show = db.shows[showId];

    if (!show) {
        return sendError(res, "Không tìm thấy kênh podcast!", 404);
    }

    const { title, author, ownerName, ownerEmail, image, link, description, language, explicit, category } = req.body;

    if (title) show.title = title.trim();
    if (author) show.author = author.trim();
    if (ownerName) show.ownerName = ownerName.trim();
    if (ownerEmail) show.ownerEmail = ownerEmail.trim();
    if (image) show.image = image.trim();
    if (link) show.link = link.trim();
    if (description) show.description = description.trim();
    if (language) show.language = language;
    if (explicit) show.explicit = explicit;
    if (category) show.category = category;

    writeDb(db);
    sendSuccess(res, show, "Cập nhật kênh thành công");
});

// 6. Delete Podcast Show (Channel)
app.delete('/api/shows/:showId', (req, res) => {
    const db = readDb();
    const { showId } = req.params;

    if (!db.shows[showId]) {
        return sendError(res, "Không tìm thấy kênh podcast!", 404);
    }

    delete db.shows[showId];
    writeDb(db);
    
    sendSuccess(res, null, `Đã xóa thành công kênh ${showId}`);
});

// 7. Get episodes of a specific Show
app.get('/api/shows/:showId/episodes', (req, res) => {
    const db = readDb();
    const show = db.shows[req.params.showId];
    if (!show) {
        return sendError(res, "Không tìm thấy kênh podcast!", 404);
    }
    sendSuccess(res, show.episodes || [], "Lấy danh sách tập thành công");
});

// 8. Add episode to a Show (Supports standard upload or Auto-TTS if audioUrl is empty)
app.post('/api/shows/:showId/episodes', async (req, res) => {
    const db = readDb();
    const { showId } = req.params;
    const show = db.shows[showId];
    const ghConfig = db.githubConfig;

    if (!show) {
        return sendError(res, "Không tìm thấy kênh podcast!", 404);
    }

    const { guid, title, audioUrl, fileSize, duration, pubDate, explicit, type, description } = req.body;

    // Check if we need to call TTS (audioUrl is missing or empty)
    const isTtsFlow = !audioUrl || audioUrl.trim() === '';

    if (isTtsFlow) {
        if (!description || !title) {
            return sendError(res, "Thiếu thông tin tập bắt buộc (title, description) khi dùng tính năng tự động tạo âm thanh TTS!");
        }
        
        if (!ghConfig.username || !ghConfig.repo || !ghConfig.token) {
            return sendError(res, "Chưa cấu hình thông tin GitHub kết nối trên Server để tải lên âm thanh TTS!");
        }

        try {
            // Call API TTS
            const formData = new FormData();
            formData.append('text', description);
            formData.append('lang', 'vi');

            const ttsResponse = await fetch('https://tts-worker.schema-api-dev.workers.dev/tts', {
                method: 'POST',
                body: formData
            });

            if (!ttsResponse.ok) {
                throw new Error(`TTS API failed with status ${ttsResponse.status}`);
            }

            const responseText = await ttsResponse.text();
            let base64Data = '';
            try {
                const json = JSON.parse(responseText);
                base64Data = json.download_url || json.data || json.audio || json.base64 || '';
            } catch (e) {
                base64Data = responseText;
            }

            if (!base64Data) {
                throw new Error("Không nhận được dữ liệu âm thanh từ API TTS");
            }

            // Clean Base64 string and convert to Buffer (General regex matches any audio data URI mime-type)
            const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
            const audioBuffer = Buffer.from(cleanBase64, 'base64');
            const calculatedSize = audioBuffer.length;

            if (calculatedSize === 0) {
                throw new Error("Dữ liệu âm thanh trống (0 bytes)");
            }

            // Upload to GitHub
            const timestamp = Math.floor(Date.now() / 1000);
            const filename = `tts_${timestamp}.mp3`;
            const gitAudioPath = `${ghConfig.audioPath}/${filename}`;
            
            await pushFileToGithubOnServer(ghConfig, gitAudioPath, cleanBase64, `Upload TTS generated audio: ${filename}`);

            // Gather values (use user value if sent, otherwise estimate)
            const finalSize = fileSize ? fileSize.toString() : calculatedSize.toString();
            const finalDuration = duration ? duration.trim() : estimateDuration(description);
            const finalAudioUrl = `https://${ghConfig.username}.github.io/${ghConfig.repo}/${gitAudioPath}`;
            const epGuid = guid ? guid.trim() : 'ep_' + Math.random().toString(36).substring(2, 12);
            const finalPubDate = pubDate || new Date().toISOString();

            const newEpisode = {
                guid: epGuid,
                title: title.trim(),
                audioUrl: finalAudioUrl,
                fileSize: finalSize,
                mimeType: "audio/mpeg",
                duration: finalDuration,
                pubDate: finalPubDate,
                explicit: explicit || 'no',
                type: type || 'full',
                description: description.trim()
            };

            if (!show.episodes) show.episodes = [];
            show.episodes.push(newEpisode);
            writeDb(db);

            // Auto-Publish to GitHub via Sequential Queue (prevents 409 SHA Conflict)
            await queuePublish(showId);

            const rssUrl = `https://${ghConfig.username}.github.io/${ghConfig.repo}/${showId}/feed.xml`;
            const responseData = {
                ...newEpisode,
                rssUrl: rssUrl
            };

            sendSuccess(res, responseData, "Tạo giọng nói, thêm tập mới và cập nhật RSS lên GitHub thành công!", 201);

        } catch (err) {
            console.error("Auto TTS inside Episode API error:", err);
            sendError(res, "Lỗi quy trình tự động TTS: " + err.message, 500);
        }
    } else {
        // Standard Flow: Normal audio upload
        if (!title || !fileSize || !duration || !pubDate || !description) {
            return sendError(res, "Thiếu thông tin tập bắt buộc!");
        }

        let mimeType = "audio/mpeg";
        if (audioUrl.endsWith('.m4a')) mimeType = "audio/x-m4a";
        else if (audioUrl.endsWith('.wav')) mimeType = "audio/wav";
        else if (audioUrl.endsWith('.ogg')) mimeType = "audio/ogg";

        const newEpisode = {
            guid: guid ? guid.trim() : 'ep_' + Math.random().toString(36).substring(2, 12),
            title: title.trim(),
            audioUrl: audioUrl.trim(),
            fileSize: fileSize.toString(),
            mimeType: mimeType,
            duration: duration.trim(),
            pubDate: pubDate,
            explicit: explicit || 'no',
            type: type || 'full',
            description: description.trim()
        };

        if (!show.episodes) show.episodes = [];
        show.episodes.push(newEpisode);
        
        writeDb(db);

        // Auto-Publish XML feed to GitHub via Sequential Queue (prevents 409 SHA Conflict)
        try {
            await queuePublish(showId);
        } catch (e) {
            console.error("Auto publish error:", e);
        }

        const rssUrl = `https://${ghConfig.username}.github.io/${ghConfig.repo}/${showId}/feed.xml`;
        const responseData = {
            ...newEpisode,
            rssUrl: rssUrl
        };

        sendSuccess(res, responseData, "Thêm tập mới và cập nhật RSS lên GitHub thành công!", 201);
    }
});

// 9. Update Episode info
app.put('/api/shows/:showId/episodes/:guid', (req, res) => {
    const db = readDb();
    const { showId, guid } = req.params;
    const show = db.shows[showId];

    if (!show) {
        return sendError(res, "Không tìm thấy kênh podcast!", 404);
    }

    const epIdx = show.episodes.findIndex(e => e.guid === guid);
    if (epIdx === -1) {
        return sendError(res, "Không tìm thấy tập podcast này!", 404);
    }

    const ep = show.episodes[epIdx];
    const { title, audioUrl, fileSize, duration, pubDate, explicit, type, description } = req.body;

    if (title) ep.title = title.trim();
    if (audioUrl) {
        ep.audioUrl = audioUrl.trim();
        let mimeType = "audio/mpeg";
        if (audioUrl.endsWith('.m4a')) mimeType = "audio/x-m4a";
        else if (audioUrl.endsWith('.wav')) mimeType = "audio/wav";
        else if (audioUrl.endsWith('.ogg')) mimeType = "audio/ogg";
        ep.mimeType = mimeType;
    }
    if (fileSize) ep.fileSize = fileSize.toString();
    if (duration) ep.duration = duration.trim();
    if (pubDate) ep.pubDate = pubDate;
    if (explicit) ep.explicit = explicit;
    if (type) ep.type = type;
    if (description) ep.description = description.trim();

    writeDb(db);
    sendSuccess(res, ep, "Cập nhật thông tin tập thành công");
});

// 10. Delete Episode
app.delete('/api/shows/:showId/episodes/:guid', (req, res) => {
    const db = readDb();
    const { showId, guid } = req.params;
    const show = db.shows[showId];

    if (!show) {
        return sendError(res, "Không tìm thấy kênh podcast!", 404);
    }

    const epIdx = show.episodes.findIndex(e => e.guid === guid);
    if (epIdx === -1) {
        return sendError(res, "Không tìm thấy tập podcast này!", 404);
    }

    show.episodes.splice(epIdx, 1);
    writeDb(db);
    sendSuccess(res, null, `Đã xóa tập ${guid} thành công`);
});

// Helper to strip HTML tags for plain text descriptions
function stripHTML(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '');
}

// Helper to convert plain URLs to clickable HTML links, keeping existing HTML links
function linkify(text) {
    if (!text) return '';
    if (text.includes('<a') || text.includes('</a>')) {
        return text; // Keep original if user already wrote HTML
    }
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
}

// 11. PUBLISH RSS FEED XML TO GITHUB (via Server)
app.post('/api/shows/:showId/publish', async (req, res) => {
    const db = readDb();
    const { showId } = req.params;
    const show = db.shows[showId];
    const ghConfig = db.githubConfig;

    if (!show) {
        return res.status(404).json({ error: "Không tìm thấy kênh podcast!" });
    }

    if (!ghConfig.username || !ghConfig.repo || !ghConfig.token) {
        return res.status(400).json({ error: "Chưa cấu hình thông tin GitHub kết nối trên Server!" });
    }

    // Build XML RSS Content
    const showLink = show.link || `https://${ghConfig.username}.github.io/${ghConfig.repo}`;
    
    // Path XML file on GitHub: <showId>/feed.xml
    const gitXmlPath = `${showId}/feed.xml`;
    
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

    try {
        const xmlBase64 = Buffer.from(xml, 'utf-8').toString('base64');
        
        // 1. Fetch file SHA from GitHub if already exists
        let currentSha = null;
        try {
            const shaResponse = await callGithubAPI(ghConfig, gitXmlPath, 'GET');
            currentSha = shaResponse.data.sha;
        } catch (e) {
            // File doesn't exist yet
        }

        // 2. Commit file to GitHub Contents
        await pushFileToGithubOnServer(ghConfig, gitXmlPath, xmlBase64, `Publish RSS Feed for show: ${showId}`, currentSha);

        // 3. Backup database.json to GitHub for safety
        // Bắt buộc phải xóa trường Token bí mật khỏi tệp gửi lên GitHub, 
        // nếu không bộ lọc bảo mật GitHub Secret Scanning sẽ chặn commit này lại.
        const dbClone = JSON.parse(JSON.stringify(db));
        if (dbClone.githubConfig && dbClone.githubConfig.token) {
            dbClone.githubConfig.token = ''; // Xóa token bí mật ở bản backup gửi lên web
        }

        const dbBase64 = Buffer.from(JSON.stringify(dbClone, null, 2), 'utf-8').toString('base64');
        let dbSha = null;
        try {
            const dbResponse = await callGithubAPI(ghConfig, 'database.json', 'GET');
            dbSha = dbResponse.data.sha;
        } catch (e) {}

        await pushFileToGithubOnServer(ghConfig, 'database.json', dbBase64, `Backup Database at publication of: ${showId}`, dbSha);

        const rssUrl = `https://${ghConfig.username}.github.io/${ghConfig.repo}/${gitXmlPath}`;
        res.json({
            success: true,
            rssUrl: rssUrl,
            message: `Xuất bản kênh ${show.title} thành công lên GitHub Pages!`
        });
    } catch (err) {
        console.error("Publish RSS Error:", err);
        res.status(500).json({ error: "Lỗi đồng bộ lên GitHub: " + err.message });
    }
});

// Helper to push file contents
async function pushFileToGithubOnServer(ghConfig, gitPath, contentBase64, commitMessage, currentSha = null) {
    const body = {
        message: commitMessage,
        content: contentBase64
    };
    if (currentSha) {
        body.sha = currentSha;
    }
    return await callGithubAPI(ghConfig, gitPath, 'PUT', body);
}

// Push file contents with automatic retry in case of 409 Conflict (due to lag or concurrent updates)
async function pushFileWithRetryOnServer(ghConfig, gitPath, contentBase64, commitMessage, retries = 3) {
    for (let i = 0; i < retries; i++) {
        let currentSha = null;
        try {
            // Fetch newest SHA from GitHub
            try {
                const shaResponse = await callGithubAPI(ghConfig, gitPath, 'GET');
                currentSha = shaResponse.data.sha;
            } catch (e) {
                // File does not exist yet on GitHub
            }

            // Attempt to upload
            await pushFileToGithubOnServer(ghConfig, gitPath, contentBase64, commitMessage, currentSha);
            return; // Success, exit function
        } catch (err) {
            // If conflict (409) and we still have retry attempts
            if (err.status === 409 && i < retries - 1) {
                console.log(`[GitHub Push Retry] 409 Conflict detected for ${gitPath}. Retrying in 1.5s... (Attempt ${i + 2}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, 1500));
            } else {
                throw err; // Real error or ran out of retries
            }
        }
    }
}

// Estimate audio duration based on word count (Vietnamese speed approx 150 words/min)
function estimateDuration(text) {
    if (!text) return '00:01:00';
    const words = text.trim().split(/\s+/).length;
    const totalSeconds = Math.max(10, Math.round(words / 2.5)); // min 10s
    
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// Automatically sync database from remote GitHub Pages on startup
async function syncDatabaseFromGithub() {
    const db = readDb();
    const { username, repo } = db.githubConfig;
    if (!username || !repo) {
        console.log("Sync DB: Chưa cấu hình kết nối GitHub, bỏ qua đồng bộ từ xa khi khởi động.");
        return;
    }

    const githubDbUrl = `https://${username}.github.io/${repo}/database.json`;
    console.log(`Sync DB: Đang đồng bộ dữ liệu từ xa tại ${githubDbUrl}...`);
    
    try {
        const res = await fetch(githubDbUrl);
        if (res.ok) {
            const remoteDb = await res.json();
            if (remoteDb && remoteDb.shows) {
                // Keep the local token (since remote backup has token stripped for security)
                const localToken = db.githubConfig.token;
                
                // Merge data
                db.shows = remoteDb.shows;
                db.githubConfig = remoteDb.githubConfig || db.githubConfig;
                
                if (localToken) {
                    db.githubConfig.token = localToken;
                }
                
                writeDb(db);
                console.log("Sync DB: Đồng bộ dữ liệu thành công từ GitHub Pages về Server cục bộ!");
            }
        } else {
            console.log(`Sync DB: Không thấy database trên GitHub Pages (Status: ${res.status}). Sử dụng database cục bộ.`);
        }
    } catch (e) {
        console.error("Sync DB Error: Lỗi đồng bộ từ GitHub Pages:", e.message);
    }
}

// Hàng đợi tuần tự xử lý xuất bản để tránh Conflict SHA khi gọi đồng thời nhiều luồng
const publishQueues = {};

function queuePublish(showId) {
    if (!publishQueues[showId]) {
        publishQueues[showId] = Promise.resolve();
    }
    
    // Thêm tác vụ vào chuỗi Promise tuần tự
    publishQueues[showId] = publishQueues[showId].then(async () => {
        try {
            console.log(`[Queue Publish] Bắt đầu xử lý xuất bản tuần tự cho kênh: ${showId}`);
            const freshDb = readDb(); // Đọc lại dữ liệu mới nhất chứa đầy đủ các tập đã thêm
            await autoPublishRssFeed(freshDb, showId);
            console.log(`[Queue Publish] Hoàn thành xuất bản tuần tự cho kênh: ${showId}`);
        } catch (err) {
            console.error(`[Queue Publish Error] Lỗi xuất bản trong hàng đợi của kênh ${showId}:`, err.message);
            throw err;
        }
    });
    
    return publishQueues[showId];
}

// Centralized Helper to build RSS XML and push both XML and database to GitHub Pages
async function autoPublishRssFeed(db, showId) {
    const show = db.shows[showId];
    const ghConfig = db.githubConfig;
    if (!show || !ghConfig.username || !ghConfig.repo || !ghConfig.token) return;

    const showLink = show.link || `https://${ghConfig.username}.github.io/${ghConfig.repo}`;
    const gitXmlPath = `${showId}/feed.xml`;
    
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

    const xmlBase64 = Buffer.from(xml, 'utf-8').toString('base64');
    
    // Push XML to GitHub (with auto retry logic for 409 Conflict)
    await pushFileWithRetryOnServer(ghConfig, gitXmlPath, xmlBase64, `Publish RSS Feed for show: ${showId}`);

    // Backup database.json to GitHub (without token, with auto retry logic for 409 Conflict)
    const dbClone = JSON.parse(JSON.stringify(db));
    if (dbClone.githubConfig && dbClone.githubConfig.token) {
        dbClone.githubConfig.token = ''; 
    }
    const dbBase64 = Buffer.from(JSON.stringify(dbClone, null, 2), 'utf-8').toString('base64');

    await pushFileWithRetryOnServer(ghConfig, 'database.json', dbBase64, `Backup Database at publication of: ${showId}`);
}

// 11. PUBLISH RSS FEED XML TO GITHUB (Conventional Manual publish trigger)
app.post('/api/shows/:showId/publish', async (req, res) => {
    const db = readDb();
    const { showId } = req.params;
    const show = db.shows[showId];
    const ghConfig = db.githubConfig;

    if (!show) {
        return sendError(res, "Không tìm thấy kênh podcast!", 404);
    }

    if (!ghConfig.username || !ghConfig.repo || !ghConfig.token) {
        return sendError(res, "Chưa cấu hình thông tin GitHub kết nối trên Server!", 400);
    }

    try {
        // Trigger helper via Sequential Queue (prevents 409 Conflict)
        await queuePublish(showId);

        const rssUrl = `https://${ghConfig.username}.github.io/${ghConfig.repo}/${showId}/feed.xml`;
        sendSuccess(res, { rssUrl: rssUrl }, `Xuất bản kênh ${show.title} thành công lên GitHub Pages!`);

    } catch (err) {
        console.error("Publish RSS Error:", err);
        sendError(res, "Lỗi đồng bộ lên GitHub: " + err.message, 500);
    }
});

// Endpoint: POST /api/shows/:showId/publish-tts (Deprecated: Redirects internally to /episodes)
app.post('/api/shows/:showId/publish-tts', async (req, res) => {
    const { text, title, duration } = req.body;
    
    // Redirect internal to episodes API
    req.url = `/api/shows/${req.params.showId}/episodes`;
    req.body = {
        title: title,
        description: text,
        duration: duration,
        audioUrl: '' // Empty trigger TTS
    };
    
    return app._router.handle(req, res);
});

// Start Server
app.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(` PodRSS Studio Server running at http://localhost:${PORT}`);
    console.log(` Database: ${DB_FILE}`);
    console.log(`====================================================`);
    
    // Sync database from remote github pages on startup
    await syncDatabaseFromGithub();
});
