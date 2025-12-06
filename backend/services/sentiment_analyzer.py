"""
Sentiment analysis service using BERT model.
Uses nlptown/bert-base-multilingual-uncased-sentiment for 1-5 star ratings.
"""
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Global model instance (lazy loaded)
_tokenizer = None
_model = None
_device = None


def get_model():
    """Lazy load the sentiment model."""
    global _tokenizer, _model, _device
    
    if _model is None:
        logger.info("Loading sentiment analysis model...")
        model_name = "nlptown/bert-base-multilingual-uncased-sentiment"
        
        _tokenizer = AutoTokenizer.from_pretrained(model_name)
        _model = AutoModelForSequenceClassification.from_pretrained(model_name)
        
        # Use GPU if available
        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        _model = _model.to(_device)
        _model.eval()
        
        logger.info(f"Sentiment model loaded on {_device}")
    
    return _tokenizer, _model, _device


def analyze_sentiment(text: str, max_length: int = 512) -> float:
    """
    Analyze sentiment of text and return normalized score.
    
    Args:
        text: The text to analyze
        max_length: Maximum token length for BERT
        
    Returns:
        float: Sentiment score from -1.0 (very negative) to +1.0 (very positive)
               0.0 represents neutral sentiment
    """
    if not text or len(text.strip()) == 0:
        return 0.0
    
    tokenizer, model, device = get_model()
    
    # For long texts, chunk and average
    chunks = chunk_text(text, max_length=400)
    
    if not chunks:
        return 0.0
    
    scores = []
    
    with torch.no_grad():
        for chunk in chunks:
            # Tokenize
            inputs = tokenizer(
                chunk,
                return_tensors="pt",
                truncation=True,
                max_length=max_length,
                padding=True
            ).to(device)
            
            # Get prediction
            outputs = model(**inputs)
            probabilities = torch.softmax(outputs.logits, dim=1)
            
            # Get weighted average (1-5 stars)
            # Stars are indices 0-4, so we add 1
            star_weights = torch.tensor([1, 2, 3, 4, 5], dtype=torch.float).to(device)
            weighted_score = (probabilities[0] * star_weights).sum().item()
            
            scores.append(weighted_score)
    
    # Average all chunk scores
    avg_score = sum(scores) / len(scores)
    
    # Normalize from 1-5 scale to -1 to +1 scale
    # 1 star -> -1.0, 3 stars -> 0.0, 5 stars -> +1.0
    normalized_score = (avg_score - 3) / 2
    
    return round(normalized_score, 3)


def chunk_text(text: str, max_length: int = 400) -> list:
    """
    Split text into chunks that fit within BERT's token limit.
    
    Args:
        text: The text to chunk
        max_length: Maximum characters per chunk (approximation)
        
    Returns:
        list: List of text chunks
    """
    # Simple sentence-based chunking
    sentences = text.replace('\n', '. ').split('. ')
    sentences = [s.strip() for s in sentences if s.strip()]
    
    chunks = []
    current_chunk = ""
    
    for sentence in sentences:
        if len(current_chunk) + len(sentence) < max_length:
            current_chunk += sentence + ". "
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = sentence + ". "
    
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    # If we still have no chunks, just split by character count
    if not chunks and text:
        chunks = [text[i:i+max_length] for i in range(0, len(text), max_length)]
    
    # Limit to first 5 chunks to avoid slow processing
    return chunks[:5]


def get_sentiment_label(score: float) -> str:
    """
    Convert sentiment score to human-readable label.
    
    Args:
        score: Normalized sentiment score (-1 to +1)
        
    Returns:
        str: Sentiment label
    """
    if score <= -0.6:
        return "Very Negative"
    elif score <= -0.3:
        return "Negative"
    elif score < 0:
        return "Slightly Negative"
    elif score == 0:
        return "Neutral"
    elif score <= 0.3:
        return "Slightly Positive"
    elif score <= 0.6:
        return "Positive"
    else:
        return "Very Positive"


def get_sentiment_color(score: float) -> str:
    """
    Get hex color for sentiment score using red-green gradient.
    No gray - uses intensity variations from deep red to deep green.
    
    Args:
        score: Normalized sentiment score (-1 to +1)
        
    Returns:
        str: Hex color code
    """
    if score <= -0.6:
        return "#b91c1c"  # Deep red (700)
    elif score <= -0.4:
        return "#dc2626"  # Red (600)
    elif score <= -0.2:
        return "#ef4444"  # Medium red (500)
    elif score < 0:
        return "#f87171"  # Light red (400)
    elif score == 0:
        return "#fca5a5"  # Very light red (300) - slight negative bias for true neutral
    elif score <= 0.2:
        return "#86efac"  # Very light green (300)
    elif score <= 0.4:
        return "#4ade80"  # Light green (400)
    elif score <= 0.6:
        return "#22c55e"  # Medium green (500)
    else:
        return "#16a34a"  # Deep green (600)
