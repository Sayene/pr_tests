-- Table: se_staging.address_points

DROP TABLE se_staging.address_points;

CREATE TABLE se_staging.address_points
(
    id bigserial,
    zip character varying(10) COLLATE pg_catalog."default",
    place character varying(100) COLLATE pg_catalog."default",
    street character varying(200) COLLATE pg_catalog."default",
    "number" character varying(20) COLLATE pg_catalog."default",
    county character varying(150) COLLATE pg_catalog."default",
    district character varying(100) COLLATE pg_catalog."default",
    state character varying(100) COLLATE pg_catalog."default",
    lat numeric,
    lon numeric,
    location point,
    status character varying(30) COLLATE pg_catalog."default",
    prg_id character varying(100) COLLATE pg_catalog."default",
    prg_loc_id uuid,
    ver timestamp with time zone,
    CONSTRAINT ap_id PRIMARY KEY (id)
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

-- set ownership and grants here

-- Index: ap_id_idx

-- DROP INDEX se_staging.ap_id_idx;

CREATE UNIQUE INDEX ap_id_idx
    ON se_staging.address_points USING btree
    (id)
    TABLESPACE pg_default;

-- Index: ap_zip_idx

-- DROP INDEX se_staging.ap_zip_idx;

CREATE INDEX ap_zip_idx
    ON se_staging.address_points USING btree
    (zip COLLATE pg_catalog."default")
    TABLESPACE pg_default;