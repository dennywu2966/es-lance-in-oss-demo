/**
 * Elasticsearch configuration
 */

export const ES_HOST = 'https://127.0.0.1:9200';
export const ES_INDEX = 'lance-validation-test';

// ES authentication - matches ES local dev setup
// IMPORTANT: Password is ALWAYS "Summer11" - see starter_project.sh which resets it
export const ES_USERNAME = 'elastic';
export const ES_PASSWORD = 'Summer11';

export const ES_AUTH = Buffer.from(`${ES_USERNAME}:${ES_PASSWORD}`, 'utf-8').toString('base64');

// Set to false when xpack.security.enabled is disabled in ES
export const ES_SECURITY_ENABLED = true;

// Jina API for embeddings
export const JINA_API_KEY = 'jina_4d22586fca5140e99831e91c67f7b09aBX3XfmHSkXlBEhn3PvJna9cZYOXb';
export const JINA_API_URL = 'https://api.jina.ai/v1/embeddings';
