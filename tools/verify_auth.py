import os
import random
import string
import time
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL or SUPABASE_KEY not found in .env")
    exit(1)

supabase: Client = create_client(url, key)

def generate_random_email():
    random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"test_user_{random_str}@gmail.com"

def verify_auth_trigger():
    email = generate_random_email()
    password = "password123"
    
    print(f"1. Attempting to sign up user: {email}")
    
    try:
        # Sign up
        auth_response = supabase.auth.sign_up({
            "email": email,
            "password": password
        })
        
        user_id = auth_response.user.id
        print(f"   Success! User created with ID: {user_id}")
        
        # Wait for trigger to fire
        print("2. Waiting for trigger to create profile...")
        time.sleep(2)
        
        # Check profiles table
        print("3. Checking public.profiles table...")
        response = supabase.table("profiles").select("*").eq("user_id", user_id).execute()
        
        if response.data and len(response.data) > 0:
            profile = response.data[0]
            print("   SUCCESS! Profile found:")
            print(f"   - ID: {profile['id']}")
            print(f"   - Handle: {profile['handle']}")
            print(f"   - Display Name: {profile['display_name']}")
            print(f"   - Type: {profile['type']}")
        else:
            print("   FAILURE: No profile found for this user.")
            
    except Exception as e:
        print(f"   Error: {e}")

if __name__ == "__main__":
    verify_auth_trigger()
