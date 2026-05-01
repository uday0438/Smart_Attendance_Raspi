# ClassLens: Edge-Optimized AI Attendance & Security System

![ClassLens Banner](public/logo512.png)

ClassLens is a full-stack, enterprise-grade AI attendance and security system. It features a React-based frontend dashboard and a Python/Flask edge-optimized backend using OpenCV for high-accuracy facial recognition. Designed to be deployed on local networks, it is especially optimized for the Raspberry Pi.

## 🚀 Features
- **3D Multi-Angle Registration**: High-accuracy facial enrollment.
- **Zero-Lag Video Streaming**: Multi-threaded edge processing.
- **Real-Time Security Logging**: Captures unauthorized individuals ("intruders").
- **Automated Daily Reports**: Generates professional PDF analytics.
- **Edge-Ready**: Deployable on ARM-based SBCs (Single Board Computers) like Raspberry Pi.
- **PWA Dashboard**: Installable web app dashboard.

## 🛠️ Components Required (For Hardware Deployment)
To deploy ClassLens as a standalone IoT system, you will need:
1. **Raspberry Pi 4 Model B (4GB or 8GB RAM recommended)** or higher.
2. **MicroSD Card (32GB+ Class 10)** pre-flashed with Raspberry Pi OS (64-bit).
3. **Raspberry Pi Camera Module V2 / V3** or a high-quality USB Webcam.
4. **Power Supply (5V 3A Type-C)**.
5. **Cooling Solution (Fan/Heatsink)** - Facial recognition generates heat.

## 🔌 Hardware Connections
1. **Camera**: 
   - If using the official Pi Camera: Connect the ribbon cable to the CSI port on the Raspberry Pi. Ensure the blue tape on the ribbon is facing the Ethernet port.
   - If using a USB Web Camera: Plug it into one of the blue USB 3.0 ports.
2. **Network**: Connect via Ethernet for the lowest latency, or configure Wi-Fi.

## 💻 Installation & Operation

### Running Locally (Laptop / Desktop)
1. **Clone the repository:**
   ```bash
   git clone https://github.com/uday0438/Smart_Attendance_Raspi.git
   cd Smart_Attendance_Raspi
   ```
2. **Install Python Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
3. **Install Frontend Dependencies & Build:**
   ```bash
   npm install
   npm run build
   ```
4. **Start the Application:**
   ```bash
   python app.py
   ```
   *The system will automatically open `http://localhost:5000` in your browser.*

### Raspberry Pi Deployment
1. Transfer the repository to your Raspberry Pi. You can use the provided `migrate.ps1` script on Windows or clone it directly onto the Pi.
2. SSH into your Raspberry Pi.
3. Install required system packages:
   ```bash
   sudo apt update
   sudo apt install cmake python3-opencv build-essential libopenblas-dev liblapack-dev libx11-dev libgtk-3-dev
   ```
4. Install Python dependencies:
   ```bash
   pip3 install -r requirements.txt
   ```
5. Run the server:
   ```bash
   python3 app.py
   ```
6. Access the dashboard from any device on your network via `http://<RASPBERRY_PI_IP>:5000`.

---
*Developed with the assistance of Antigravity (Google Deepmind Advanced Agentic Coding Assistant)*
