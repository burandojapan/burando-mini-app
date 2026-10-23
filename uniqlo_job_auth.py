"""Dedicated cron credential: grants only the exact TEST daily-sync operation."""
import hmac
import os

def valid_job_key(value):
    expected=os.getenv('UNIQLO_JOB_KEY','')
    return len(expected)>=32 and len(value)<=512 and value.isascii() and expected.isascii() and hmac.compare_digest(value,expected)
