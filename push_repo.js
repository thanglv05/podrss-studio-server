const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');

const TOKEN = "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";
const USERNAME = "thanglv05";
const REPO_NAME = "podrss-studio-server";

// 1. Send API to create a new private repository on GitHub
function createRepo() {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            name: REPO_NAME,
            private: true,
            description: "Podcast RSS Studio Backend Server running on Render.com"
        });

        const options = {
            hostname: 'api.github.com',
            path: '/user/repos',
            method: 'POST',
            headers: {
                'Authorization': `token ${TOKEN}`,
                'User-Agent': 'NodeJS-Setup-Script',
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 201) {
                    console.log("-> Đã tạo thành công Repository riêng tư (Private Repo) trên GitHub!");
                    resolve(JSON.parse(body));
                } else if (res.statusCode === 422) {
                    console.log("-> Repository đã tồn tại trên GitHub, tiến hành đồng bộ code.");
                    resolve({ name: REPO_NAME });
                } else {
                    reject(new Error(`Tạo Repo thất bại: Status ${res.statusCode}. ${body}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}

async function run() {
    try {
        await createRepo();
        
        console.log("-> Bắt đầu cấu hình Git và đẩy code lên GitHub...");
        
        // Execute git commands locally
        const execOptions = { stdio: 'inherit' };
        
        try {
            execSync('git init', execOptions);
        } catch (e) {}
        
        try {
            execSync('git checkout -b main', execOptions);
        } catch (e) {}
        
        execSync('git add .', execOptions);
        
        try {
            execSync('git commit -m "Initial commit of PodRSS Studio Server"', execOptions);
        } catch (e) {
            console.log("-> Không có thay đổi mới để commit.");
        }
        
        // Remove old origin remote if exists
        try {
            execSync('git remote remove origin', execOptions);
        } catch (e) {}
        
        // Add new remote with authentication token
        const remoteUrl = `https://${USERNAME}:${TOKEN}@github.com/${USERNAME}/${REPO_NAME}.git`;
        execSync(`git remote add origin ${remoteUrl}`, execOptions);
        
        console.log("-> Đang đẩy mã nguồn lên GitHub...");
        execSync('git push -u origin main --force', execOptions);
        
        console.log("\n=======================================================");
        console.log(" HOÀN THÀNH: Đã đẩy thành công mã nguồn lên GitHub!");
        console.log(` Repo Link: https://github.com/${USERNAME}/${REPO_NAME}`);
        console.log("=======================================================");
        
    } catch (err) {
        console.error("❌ Lỗi trong quá trình xử lý:", err.message);
    } finally {
        // Self delete this temporary script
        try {
            fs.unlinkSync(__filename);
        } catch (e) {}
    }
}

run();
