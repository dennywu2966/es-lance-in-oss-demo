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
# - ES distribution in ../es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT
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
ES_DIST_DIR="../es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT"
NEXTJS_DIR="$SCRIPT_DIR"

# Ports
ES_PORT=9200
NEXTJS_PORT=3000

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

    # Start Next.js in background
    nohup npm run dev > "$NEXTJS_LOG_FILE" 2>&1 &
    NEXTJS_PID=$!

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
}

print_access_info() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Demo Stack Ready!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}Access URLs:${NC}"
    echo "  Next.js Demo:  http://localhost:$NEXTJS_PORT"
    echo ""
    echo "  Elasticsearch: https://$ES_HOST:$ES_PORT"
    echo "                Username: $ES_USER"
    echo "                Password: $ES_PASSWORD"
    echo ""
    echo -e "${BLUE}To stop the stack:${NC}"
    echo "  # Stop ES"
    echo "  cd $ES_DIST_DIR"
    echo "  kill \$(cat elasticsearch.pid)"
    echo ""
    echo "  # Stop Next.js"
    echo "  fuser -k $NEXTJS_PORT/tcp"
    echo ""
    echo -e "${BLUE}Logs:${NC}"
    echo "  ES:     $ES_DIST_DIR/logs/elasticsearch.log"
    echo "  NextJS: $NEXTJS_LOG_FILE"
    echo ""
    echo -e "${BLUE}API Endpoints:${NC}"
    echo "  Vector list:    http://localhost:$NEXTJS_PORT/api/vectors"
    echo "  kNN search:     http://localhost:$NEXTJS_PORT/api/search"
    echo "  Generate:       POST http://localhost:$NEXTJS_PORT/api/vectors/generate"
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

# Start Next.js
start_nextjs

# Verify the complete stack
verify_stack

# Print access information
print_access_info

log_success "Stack startup complete!"
