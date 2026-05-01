import paramiko
import os
import time

# Credentials provided by the user
IP = "10.22.178.171"
USER = "uday"
PASS = "music"
ZIP_FILE = "ClassLens_Pi_Migration.zip"
REMOTE_DIR = "~/attendence-main"

def migrate():
    try:
        print(f">>> Connecting to Raspberry Pi at {IP}...")
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(IP, username=USER, password=PASS, timeout=10)
        
        print(">>> Connection established.")
        
        # 1. Upload the zip file
        sftp = ssh.open_sftp()
        print(f">>> Uploading {ZIP_FILE}...")
        sftp.put(ZIP_FILE, f"/home/{USER}/{ZIP_FILE}")
        sftp.close()
        print(">>> Upload complete.")
        
        # 2. Setup directory and Extract
        print(">>> Extracting files on Pi...")
        commands = [
            f"mkdir -p {REMOTE_DIR}",
            f"unzip -o ~/{ZIP_FILE} -d {REMOTE_DIR}",
            f"rm ~/{ZIP_FILE}"
        ]
        
        for cmd in commands:
            stdin, stdout, stderr = ssh.exec_command(cmd)
            exit_status = stdout.channel.recv_exit_status()
            if exit_status != 0:
                print(f"!!! Error executing command: {cmd}")
                print(stderr.read().decode())
        
        print(">>> Extraction complete.")
        
        # 3. Final Verification
        stdin, stdout, stderr = ssh.exec_command(f"ls -R {REMOTE_DIR}")
        print("\n>>> Project Structure on Pi:")
        print(stdout.read().decode())
        
        ssh.close()
        print("\n" + "="*50)
        print(" SUCCESS: ALL FILES MIGRATED TO RASPBERRY PI!")
        print("="*50)
        
    except Exception as e:
        print(f"\n!!! MIGRATION FAILED: {str(e)}")

if __name__ == "__main__":
    if not os.path.exists(ZIP_FILE):
        print(f"!!! Error: {ZIP_FILE} not found. Please create it first.")
    else:
        migrate()
