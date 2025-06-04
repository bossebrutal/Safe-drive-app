import mysql.connector

# Replace with your actual password if it's not empty
conn = mysql.connector.connect(
    host="localhost",
    user="safedrive",
    password="StrongPassword123!"
)

cursor = conn.cursor()
cursor.execute("CREATE DATABASE IF NOT EXISTS safedrive;")
print("✅ Database 'safedrive' created or already exists.")

cursor.close()
conn.close()
