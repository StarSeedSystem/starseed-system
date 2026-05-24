#!/bin/bash

# Check if supabase is installed
if ! command -v supabase &> /dev/null; then
    echo "Supabase CLI could not be found. Please install it first."
    exit 1
fi

echo "Starting local Supabase instance..."
if supabase start; then
    echo "Supabase started successfully!"
    echo "Dashboard: http://localhost:54323"
else
    echo "Failed to start Supabase. Please check Docker status."
    exit 1
fi
