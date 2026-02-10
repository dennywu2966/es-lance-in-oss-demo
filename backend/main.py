"""
Lance Dataset Service - FastAPI Backend

Main application entry point for dataset generation and management.
Uses OSS credentials from ~/.oss/credentials.json (matching Next.js).
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from routes import dataset

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Lance Dataset Service",
    description="Python backend for Lance dataset generation and OSS management",
    version="1.0.0"
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(dataset.router, prefix="/api/v1", tags=["dataset"])

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "lance-dataset-service",
        "version": "1.0.0"
    }

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with service info"""
    return {
        "service": "Lance Dataset Service",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "datasets": "/api/v1/datasets",
            "generate": "/api/v1/dataset/generate",
            "job_status": "/api/v1/dataset/status/{job_id}",
            "stream": "/api/v1/dataset/stream/{job_id}"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
