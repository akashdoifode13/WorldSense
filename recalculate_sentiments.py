"""
Script to recalculate sentiment scores for all existing summaries in the database
using the updated FinBERT model.
"""
import sys
import os
from sqlalchemy.orm import Session
from tqdm import tqdm

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.database import SessionLocal
from backend.models import DailySummary
from backend.services.sentiment_analyzer import analyze_sentiment

def recalculate_sentiments():
    db: Session = SessionLocal()
    try:
        # Get all summaries
        print("Fetching all summaries...")
        summaries = db.query(DailySummary).all()
        total = len(summaries)
        print(f"Found {total} summaries to process.")
        
        updated_count = 0
        
        print("\nRecalculating sentiments using FinBERT...")
        # Use simple iteration with progress indication
        for i, summary in enumerate(summaries):
            if not summary.summary_text:
                continue
                
            # print(f"[{i+1}/{total}] Processing {summary.country} ({summary.date})...")
            
            try:
                # Recalculate score
                new_score = analyze_sentiment(summary.summary_text)
                
                # Update if changed (floating point comparison)
                if summary.sentiment_score is None or abs(summary.sentiment_score - new_score) > 0.001:
                    # print(f"  -> Score changed: {summary.sentiment_score} -> {new_score}")
                    summary.sentiment_score = new_score
                    updated_count += 1
            except Exception as e:
                print(f"Error processing {summary.country}: {e}")
                
            # Periodically commit to save progress
            if i % 10 == 0:
                sys.stdout.write(f"\rProgress: {i}/{total} summaries processed")
                sys.stdout.flush()
                db.commit()

        # Final commit
        db.commit()
        print(f"\n\nCompleted! Updated {updated_count} summaries out of {total}.")
        
    except Exception as e:
        print(f"Error during recalculation: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    recalculate_sentiments()
