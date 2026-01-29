import os
import asyncio
from supabase import create_client, Client

# Use environment variables or hardcoded for this check (assuming user provides valid envs, 
# but here we might need to ask user for keys if not present. 
# For now, I will use placeholder and expect it to run if envs are set or fail with message)

# Note: In a real agentic run, I would read .env file or ask user. 
# Since I created the project, I need the keys. 
# I can get publishable keys from `get_publishable_keys`.

async def main():
    print("Verifying Supabase Connection...")
    
    url = os.environ.get("SUPABASE_URL") 
    key = os.environ.get("SUPABASE_KEY")

    if not url or not key:
        print("Error: SUPABASE_URL or SUPABASE_KEY not set.")
        return

    supabase: Client = create_client(url, key)

    try:
        # Simple query to check connection
        response = supabase.table("profiles").select("*").limit(1).execute()
        print(f"Connection Successful! Response: {response}")
    except Exception as e:
        print(f"Connection Failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
