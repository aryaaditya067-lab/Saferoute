CREATE TABLE IF NOT EXISTS incident (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    crime_type      VARCHAR(40)   NOT NULL,
    category        VARCHAR(20)   NOT NULL,
    headline        VARCHAR(500)  NOT NULL,
    locality        VARCHAR(200)  NOT NULL,
    locality_key    VARCHAR(200)  NOT NULL,
    location_label  VARCHAR(500),
    lat             DOUBLE        NOT NULL,
    lng             DOUBLE        NOT NULL,
    radius_m        INT           NOT NULL,
    occurred_on     DATE          NOT NULL,
    evidence_quote  VARCHAR(1000) NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_occurred ON incident (occurred_on);
CREATE INDEX IF NOT EXISTS idx_incident_lat_lng ON incident (lat, lng);
CREATE INDEX IF NOT EXISTS idx_incident_dedupe ON incident (crime_type, locality_key, occurred_on);

CREATE TABLE IF NOT EXISTS incident_source (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    incident_id  BIGINT        NOT NULL,
    url          VARCHAR(2000) NOT NULL,
    title        VARCHAR(500),
    site         VARCHAR(200),
    published_on DATE,
    fetched_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_source_incident FOREIGN KEY (incident_id) REFERENCES incident (id) ON DELETE CASCADE,
    CONSTRAINT uq_source_url UNIQUE (url)
);

CREATE TABLE IF NOT EXISTS ingest_run (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    started_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    succeeded   BOOLEAN NOT NULL DEFAULT FALSE,
    candidates  INT NOT NULL DEFAULT 0,
    accepted    INT NOT NULL DEFAULT 0,
    merged      INT NOT NULL DEFAULT 0,
    rejected    INT NOT NULL DEFAULT 0,
    error       VARCHAR(2000)
);

-- Every article URL the ingest has read, so it is never read (or paid for) twice.
CREATE TABLE IF NOT EXISTS processed_url (
    url          VARCHAR(2000) PRIMARY KEY,
    outcome      VARCHAR(40)   NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Community safety reports. reporter_key / ip_key are salted SHA-256 hashes, never raw ids or IPs.
CREATE TABLE IF NOT EXISTS community_report (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    category     VARCHAR(20)  NOT NULL,
    lat          DOUBLE       NOT NULL,
    lng          DOUBLE       NOT NULL,
    note         VARCHAR(200),
    reporter_key VARCHAR(64)  NOT NULL,
    ip_key       VARCHAR(64)  NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_community_created ON community_report (created_at);
CREATE INDEX IF NOT EXISTS idx_community_lat_lng ON community_report (lat, lng);
CREATE INDEX IF NOT EXISTS idx_community_reporter ON community_report (reporter_key, created_at);

CREATE TABLE IF NOT EXISTS app_setting (
    name VARCHAR(64)  PRIMARY KEY,
    val  VARCHAR(256) NOT NULL
);
