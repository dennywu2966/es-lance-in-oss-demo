#!/bin/bash
##############################################################################
# Project Starter Script for es-lance-demo (Next.js + Lance Vector + ES)
#
# This script:
# 1. Checks if Elasticsearch is running on port 9200
# 2. Starts ES if not running (with OSS credentials and Lance Vector plugin)
# 3. Starts the Next.js dev server on port 3000
#
# Requirements:
# - OSS credentials in ~/.oss/credentials.json
# - ES distribution in /home/denny/projects/es-9.2.4-plugins-rt-scale/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT
# - Node.js and npm installed
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

##############################################################################
# Configuration
##############################################################################

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ES_DIST_DIR_DEFAULT="/home/denny/projects/es-9.2.4-plugins-rt-scale/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT"
ES_DIST_DIR="${ES_DIST_DIR:-$ES_DIST_DIR_DEFAULT}"
NEXTJS_DIR="$SCRIPT_DIR"

# Ports
ES_PORT=9200
NEXTJS_PORT=3000
PYTHON_PORT=8000

# ES Configuration
ES_PASSWORD="Summer11"
ES_USER="elastic"
ES_HOST="127.0.0.1"

# OSS Configuration
OSS_CREDS_FILE="$HOME/.oss/credentials.json"
OSS_BUCKET="denny-test-lance"

# Log files
ES_LOG_FILE="/tmp/es-lance-demo-es.log"
NEXTJS_LOG_FILE="/tmp/es-lance-demo-nextjs.log"

##############################################################################
# Functions
##############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Lance Demo Stack Starter${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Check if a port is in use
is_port_in_use() {
    local port=$1
    fuser "$port/tcp" 2>/dev/null
}

# Check if ES is responding
is_es_ready() {
    curl -s -k -u "$ES_USER:$ES_PASSWORD" "https://$ES_HOST:$ES_PORT/_cluster/health" > /dev/null 2>&1
}

# Check if Python backend is responding
is_python_ready() {
    curl -s "http://localhost:$PYTHON_PORT/health" > /dev/null 2>&1
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    local errors=0

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found. Please install Node.js first."
        ((errors++))
    fi

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm not found. Please install npm first."
        ((errors++))
    fi

    # Check ES distribution
    if [ ! -d "$ES_DIST_DIR" ]; then
        log_error "Elasticsearch distribution not found: $ES_DIST_DIR"
        ((errors++))
    fi

    # Check OSS credentials
    if [ ! -f "$OSS_CREDS_FILE" ]; then
        log_error "OSS credentials not found: $OSS_CREDS_FILE"
        ((errors++))
    fi

    # Check node_modules
    if [ ! -d "$NEXTJS_DIR/node_modules" ]; then
        log_warning "node_modules not found. Running 'npm install'..."
        cd "$NEXTJS_DIR"
        npm install
        cd "$SCRIPT_DIR"
    fi

    # Check Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 not found. Please install Python 3 first."
        ((errors++))
    fi

    # Check Python backend dependencies
    if [ -d "$SCRIPT_DIR/backend" ]; then
        if ! python3 -c "import fastapi, uvicorn, oss2, lance" 2>/dev/null; then
            log_warning "Python backend dependencies not fully installed. Run 'cd backend && pip install -r requirements.txt' if needed."
        fi
    fi

    if [ $errors -gt 0 ]; then
        log_error "Prerequisites check failed with $errors error(s)"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

start_elasticsearch() {
    log_info "Checking Elasticsearch status..."

    # Check if ES is already running and responsive
    if is_port_in_use $ES_PORT && is_es_ready; then
        log_success "Elasticsearch is already running on port $ES_PORT"
        return 0
    fi

    # Port is in use but not responding - kill it
    if is_port_in_use $ES_PORT; then
        log_warning "Port $ES_PORT is in use but ES not responding - killing existing process..."
        fuser -k $ES_PORT/tcp 2>/dev/null || true
        sleep 2
    fi

    log_info "Starting Elasticsearch..."

    cd "$ES_DIST_DIR"

    # Check if there's an existing PID file
    if [ -f "elasticsearch.pid" ]; then
        OLD_PID=$(cat elasticsearch.pid)
        if ps -p "$OLD_PID" > /dev/null 2>&1; then
            log_warning "Killing existing ES process (PID: $OLD_PID)..."
            kill "$OLD_PID" 2>/dev/null || true
            sleep 2
        fi
        rm -f elasticsearch.pid
    fi

    # Extract OSS credentials
    OSS_ACCESS_KEY_ID=$(grep '"access_key_id"' "$OSS_CREDS_FILE" | cut -d'"' -f4)
    OSS_ACCESS_KEY_SECRET=$(grep '"access_key_secret"' "$OSS_CREDS_FILE" | cut -d'"' -f4)
    OSS_REGION=$(grep '"region"' "$OSS_CREDS_FILE" | cut -d'"' -f4)
    OSS_ENDPOINT=$(grep '"endpoint"' "$OSS_CREDS_FILE" | cut -d'"' -f4)

    # Export OSS environment variables
    export OSS_ACCESS_KEY_ID
    export OSS_ACCESS_KEY_SECRET
    export OSS_REGION
    export OSS_ENDPOINT
    export OSS_BUCKET

    log_info "OSS Configuration:"
    echo "  Endpoint: $OSS_ENDPOINT"
    echo "  Region: $OSS_REGION"
    echo "  Bucket: $OSS_BUCKET"
    echo "  AK: ${OSS_ACCESS_KEY_ID:0:8}..."

    # Start ES in background
    ./bin/elasticsearch -d -p elasticsearch.pid > "$ES_LOG_FILE" 2>&1

    log_info "Waiting for Elasticsearch to be ready..."

    # Wait for ES to be ready (up to 60 seconds)
    for i in {1..30}; do
        if is_es_ready; then
            log_success "Elasticsearch is ready!"

            # Verify plugins are loaded
            sleep 2
            PLUGINS_OUTPUT=$(curl -s -k -u "$ES_USER:$ES_PASSWORD" "https://$ES_HOST:$ES_PORT/_cat/plugins?v" 2>/dev/null)
            if echo "$PLUGINS_OUTPUT" | grep -q "lance-vector"; then
                log_success "✓ lance-vector plugin loaded"
            else
                log_warning "✗ lance-vector plugin NOT loaded (may need ES rebuild)"
            fi

            if echo "$PLUGINS_OUTPUT" | grep -q "cloud-iam"; then
                log_success "✓ security-realm-cloud-iam plugin loaded"
            else
                log_warning "✗ security-realm-cloud-iam plugin NOT loaded (may need ES rebuild)"
            fi

            cd "$SCRIPT_DIR"
            return 0
        fi
        echo -n "."
        sleep 2
    done
    echo ""

    log_error "Elasticsearch failed to start. Check logs:"
    echo "  tail -50 $ES_DIST_DIR/logs/elasticsearch.log"
    echo "  tail -50 $ES_LOG_FILE"
    cd "$SCRIPT_DIR"
    exit 1
}

start_nextjs() {
    log_info "Checking Next.js dev server status..."

    # Check if Next.js is already running on port 3000
    if is_port_in_use $NEXTJS_PORT; then
        log_warning "Next.js is already running on port $NEXTJS_PORT"
        read -p "Stop existing process and restart? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "Stopping existing Next.js process..."
            fuser -k $NEXTJS_PORT/tcp 2>/dev/null || true
            sleep 2
        else
            log_info "Keeping existing Next.js process"
            return 0
        fi
    fi

    log_info "Starting Next.js dev server..."

    cd "$NEXTJS_DIR"

    # Start Next.js as a detached session so it survives shell/session termination.
    # Dev ES uses a self-signed cert on https://127.0.0.1:9200.
    NODE_TLS_REJECT_UNAUTHORIZED=0 setsid -f nohup npm run dev > "$NEXTJS_LOG_FILE" 2>&1 < /dev/null
    NEXTJS_PID=$(pgrep -f "next dev" | head -n 1 || true)

    log_info "Waiting for Next.js to be ready..."

    # Wait for Next.js to be ready (up to 30 seconds)
    for i in {1..30}; do
        if curl -s "http://localhost:$NEXTJS_PORT" > /dev/null 2>&1; then
            log_success "Next.js is ready!"
            cd "$SCRIPT_DIR"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    echo ""

    log_warning "Next.js is taking longer than expected. Check logs:"
    echo "  tail -50 $NEXTJS_LOG_FILE"
    log_info "Next.js PID: $NEXTJS_PID"
    cd "$SCRIPT_DIR"
}

start_python_backend() {
    log_info "Checking Python backend status..."

    # Check if Python backend is already running on port 8000
    if is_port_in_use $PYTHON_PORT && is_python_ready; then
        log_success "Python backend is already running on port $PYTHON_PORT"
        return 0
    fi

    # Port is in use but not responding - kill it
    if is_port_in_use $PYTHON_PORT; then
        log_warning "Port $PYTHON_PORT is in use but Python backend not responding - killing existing process..."
        fuser -k $PYTHON_PORT/tcp 2>/dev/null || true
        sleep 2
    fi

    log_info "Starting Python FastAPI backend..."

    # Check if backend directory exists
    if [ ! -d "$SCRIPT_DIR/backend" ]; then
        log_error "Backend directory not found at $SCRIPT_DIR/backend. Skipping Python backend."
        return 1
    fi

    cd "$SCRIPT_DIR/backend"

    # Start Python backend as a detached session so it survives shell/session termination
    setsid -f nohup python3 main.py > /tmp/es-lance-demo-python.log 2>&1 < /dev/null
    PYTHON_PID=$(pgrep -f "python3 main.py" | head -n 1 || true)

    log_info "Waiting for Python backend to be ready..."

    # Wait for Python backend to be ready (up to 15 seconds)
    for i in {1..15}; do
        if is_python_ready; then
            log_success "Python backend is ready!"
            cd "$SCRIPT_DIR"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    echo ""

    log_warning "Python backend is taking longer than expected. Check logs:"
    echo "  tail -50 /tmp/es-lance-demo-python.log"
    log_info "Python backend PID: $PYTHON_PID"
    cd "$SCRIPT_DIR"
}

verify_stack() {
    log_info "Verifying stack status..."

    # Check ES health
    if is_es_ready; then
        ES_HEALTH=$(curl -s -k -u "$ES_USER:$ES_PASSWORD" "https://$ES_HOST:$ES_PORT/_cluster/health?pretty" 2>/dev/null | grep '"status"' | cut -d'"' -f4)
        if [ "$ES_HEALTH" = "green" ] || [ "$ES_HEALTH" = "yellow" ]; then
            log_success "Elasticsearch: $ES_HEALTH health"
        else
            log_warning "Elasticsearch: $ES_HEALTH health"
        fi
    else
        log_error "Elasticsearch: Not responding"
    fi

    # Check Next.js
    if curl -s "http://localhost:$NEXTJS_PORT" > /dev/null 2>&1; then
        log_success "Next.js: Running on port $NEXTJS_PORT"
    else
        log_warning "Next.js: Not responding yet (check $NEXTJS_LOG_FILE)"
    fi

    # Check Python backend
    if is_python_ready; then
        log_success "Python Backend: Running on port $PYTHON_PORT"
    else
        log_warning "Python Backend: Not responding yet (check /tmp/es-lance-demo-python.log)"
    fi
}

print_access_info() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Demo Stack Ready!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}Access URLs:${NC}"
    echo "  Next.js Demo:     http://localhost:$NEXTJS_PORT"
    echo "  Python Backend:   http://localhost:$PYTHON_PORT"
    echo "  Elasticsearch:    https://$ES_HOST:$ES_PORT"
    echo "                    Username: $ES_USER"
    echo "                    Password: $ES_PASSWORD"
    echo ""
    echo -e "${BLUE}To stop the stack:${NC}"
    echo "  # Stop ES"
    echo "  cd $ES_DIST_DIR"
    echo "  kill \$(cat elasticsearch.pid)"
    echo ""
    echo "  # Stop Python Backend"
    echo "  fuser -k $PYTHON_PORT/tcp"
    echo ""
    echo "  # Stop Next.js"
    echo "  fuser -k $NEXTJS_PORT/tcp"
    echo ""
    echo -e "${BLUE}Logs:${NC}"
    echo "  ES:       $ES_DIST_DIR/logs/elasticsearch.log"
    echo "  NextJS:   $NEXTJS_LOG_FILE"
    echo "  Python:   /tmp/es-lance-demo-python.log"
    echo ""
    echo -e "${BLUE}API Endpoints:${NC}"
    echo "  Python Backend:"
    echo "    Health check:  GET http://localhost:$PYTHON_PORT/health"
    echo "    List datasets:  GET http://localhost:$PYTHON_PORT/api/v1/datasets"
    echo "    Generate:       POST http://localhost:$PYTHON_PORT/api/v1/dataset/generate"
    echo "    Job status:     GET http://localhost:$PYTHON_PORT/api/v1/dataset/status/{job_id}"
    echo "    Job stream:     GET http://localhost:$PYTHON_PORT/api/v1/dataset/stream/{job_id}"
    echo ""
    echo "  Next.js (Legacy API - use Python backend instead):"
    echo "    Vector list:    http://localhost:$NEXTJS_PORT/api/vectors"
    echo "    kNN search:     http://localhost:$NEXTJS_PORT/api/search"
    echo ""
    echo "  Elasticsearch (Direct - for Lance plugin testing):"
    echo "    kNN search:     POST https://$ES_HOST:$ES_PORT/lance-validation-test/_search"
    echo "                    (with lance_knn query)"
    echo ""
}

##############################################################################
# Main Script
##############################################################################

print_header

# Save current directory
ORIGINAL_DIR=$(pwd)
trap "cd $ORIGINAL_DIR" EXIT

# Check prerequisites
check_prerequisites

# Start Elasticsearch
start_elasticsearch

# Start Python backend
start_python_backend

# Start Next.js
start_nextjs

# Verify the complete stack
verify_stack

# Print access information
print_access_info

log_success "Stack startup complete!"
