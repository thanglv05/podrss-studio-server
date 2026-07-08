# Hướng Dẫn Vận Hành Server & Đặc Tả HTTP API - PodRSS Studio

Hệ thống **PodRSS Studio** đã được nâng cấp thành một ứng dụng **Node.js Express Server**. 

Hệ thống này hỗ trợ:
1.  **Quản lý đa kênh (Multi-Channel)**: Mỗi kênh podcast sẽ có một mã **Show ID** ngẫu nhiên duy nhất (ví dụ: `show_8f2d9c7a`). Khi xuất bản, file XML tương ứng sẽ nằm ở đường dẫn riêng biệt trên GitHub Pages (ví dụ: `https://<username>.github.io/<repo>/<showId>/feed.xml`).
2.  **Hệ thống HTTP API**: Cho phép các phần mềm hoặc script tự động hóa khác của bạn tự gọi để thêm kênh, thêm tập mới và tự động xuất bản mà không cần thao tác qua giao diện web.

---

## 🚀 Hướng Dẫn Chạy Server Cục Bộ

Để chạy ứng dụng trên máy tính của bạn:

1.  Mở terminal (PowerShell hoặc CMD) tại thư mục `d:\Desktop\Link Rss`.
2.  Chạy lệnh để start server:
    ```bash
    npm start
    ```
    *(Server Express sẽ khởi chạy tại cổng **3000** và tải cơ sở dữ liệu `database.json` lên)*.
3.  Mở trình duyệt web của bạn và truy cập địa chỉ:
    👉 **`http://localhost:3000`**
    *(Tại đây bạn sẽ có giao diện đồ họa quản lý, chuyển đổi đa kênh, upload kéo thả file nhạc và nhấn xuất bản 1-click).*

---

## 📖 Đặc Tả Hệ Thống HTTP API (Tự Động Hóa)

Bạn có thể sử dụng bất kỳ ngôn ngữ lập trình nào (Python, Javascript, cURL...) để gọi các API dưới đây đến server local (`http://localhost:3000`) nhằm tự động hóa việc quản lý podcast.

### 1. Cấu hình kết nối GitHub
*   **API**: `POST /api/github-config`
*   **Mô tả**: Lưu thông tin tài khoản GitHub và mã Token lên server.
*   **Body (JSON)**:
    ```json
    {
      "username": "thanglv05",
      "repo": "my-podcast",
      "token": "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",
      "audioPath": "audio"
    }
    ```

---

### 2. Tạo Kênh Podcast Mới
*   **API**: `POST /api/shows`
*   **Mô tả**: Tạo một kênh podcast mới. Server sẽ tự động sinh một mã `id` ngẫu nhiên duy nhất (ví dụ: `show_a1b2c3d4`).
*   **Body (JSON)**:
    ```json
    {
      "title": "Tâm Sự Đêm Khuya",
      "author": "Nguyễn Văn A",
      "ownerName": "Nguyễn Văn A",
      "ownerEmail": "backlinkpodcast@likepion.com",
      "image": "https://images.unsplash.com/photo-1590602847861-f357a9332bbc",
      "link": "https://thanglv05.github.io/my-podcast",
      "description": "Kênh tâm sự về cuộc sống và con người.",
      "language": "vi",
      "category": "Society & Culture"
    }
    ```
*   **Phản hồi (JSON)**: Trả về thông tin kênh vừa tạo kèm mã `id` ngẫu nhiên.

---

### 3. Thêm Tập Mới Vào Kênh (Hỗ trợ 2 luồng: Truyền thống & Tự động TTS)
*   **API**: `POST /api/shows/:showId/episodes`
*   **Mô tả**: Thêm tập podcast mới vào kênh.
    *   **Luồng 1 (Truyền thống)**: Nếu bạn gửi kèm trường `audioUrl`, server sẽ lưu tập tin như bình thường.
    *   **Luồng 2 (Tự động TTS)**: Nếu bạn **bỏ trống hoặc không gửi** trường `audioUrl`, server sẽ tự động lấy nội dung từ trường `description` gửi sang API TTS của bạn để chuyển thành file nhạc, tự động upload lên GitHub Pages, tính dung lượng/thời lượng, tạo tập mới và tự động xuất bản (publish feed XML) ngay lập tức!
*   **Body (JSON)**:
    ```json
    {
      "title": "Tập 02: Vượt qua khủng hoảng tuổi 20",
      "description": "Nội dung chia sẻ về cách vượt qua những khó khăn của tuổi trẻ...",
      "explicit": "no",
      "type": "full",
      "pubDate": "2026-07-08T10:00"
    }
    ```
    *(Nếu sử dụng Luồng 2 (TTS), bạn không cần gửi `audioUrl`, `fileSize` hay `duration` vì server sẽ tự sinh. `pubDate` nếu bỏ trống sẽ tự lấy thời gian hiện tại)*.
*   **Tham số**: `:showId` là mã ID ngẫu nhiên của kênh (ví dụ: `show_8f2d9c7a`).

---

### 4. Xuất Bản & Đồng Bộ Lên GitHub Pages (Thủ công)
*   **API**: `POST /api/shows/:showId/publish`
*   **Mô tả**: Ra lệnh cho server tự động tạo file XML RSS cho kênh này và đẩy lên repo GitHub của bạn tại thư mục `<showId>/feed.xml`, đồng thời tự động backup database lên GitHub (khi dùng luồng tự động TTS ở API 3 thì bước này đã tự chạy ngầm).
*   **Phản hồi thành công (JSON)**:
    ```json
    {
      "success": true,
      "rssUrl": "https://thanglv05.github.io/my-podcast/show_8f2d9c7a/feed.xml",
      "message": "Xuất bản kênh Cà Phê Công Nghệ thành công lên GitHub Pages!"
    }
    ```

---

## 🐍 Ví dụ Code Python để Gọi API Tự Động Hóa

### Cách 1: Gửi Văn bản và Tự Động TTS + Xuất Bản Trọn Gói (Khuyên Dùng)
*(Gọi API `/episodes` và không gửi trường `audioUrl` để kích hoạt robot tự đọc và đồng bộ)*

```python
import requests

SERVER_URL = "http://localhost:3000"
SHOW_ID = "show_8f2d9c7a"  # Thay bằng ID kênh của bạn

# Dữ liệu văn bản tập mới (Bỏ qua trường audioUrl để kích hoạt TTS tự động)
payload = {
    "title": "Tập mới sinh tự động qua TTS",
    "description": "Chào các bạn, đây là tập podcast được sinh ra hoàn toàn tự động từ văn bản thông qua API tts-worker và tự đẩy lên GitHub của tôi.",
    "explicit": "no",
    "type": "full"
}

# Gọi API thêm tập
print("Đang gửi yêu cầu sinh TTS & xuất bản...")
res = requests.post(f"{SERVER_URL}/api/shows/{SHOW_ID}/episodes", json=payload)

if res.status_code == 201 or res.status_code == 200:
    data = res.json()
    print("XUẤT BẢN THÀNH CÔNG!")
    print(f"-> Link File Nhạc sinh ra: {data['audioUrl']}")
    print(f"-> Thời lượng: {data['duration']}")
    print(f"-> Dung lượng: {data['fileSize']} bytes")
else:
    print("Lỗi quy trình TTS:", res.json().get('error', res.text))
```

### Cách 2: Thêm Tập Thủ Công Khi Đã Có Link Nhạc Sẵn

```python
import requests

SERVER_URL = "http://localhost:3000"
SHOW_ID = "show_8f2d9c7a"

new_episode = {
    "title": "Tập thủ công",
    "audioUrl": "https://thanglv05.github.io/my-podcast/audio/tap-02.mp3",
    "fileSize": 15485962,
    "duration": "00:15:30",
    "pubDate": "2026-07-08T11:00",
    "description": "Tập này có file audio sẵn.",
    "explicit": "no",
    "type": "full"
}

# 1. Thêm tập
add_res = requests.post(f"{SERVER_URL}/api/shows/{SHOW_ID}/episodes", json=new_episode)
if add_res.status_code == 201:
    print("Thêm tập thủ công thành công! Hệ thống đã tự động xuất bản XML.")
```
