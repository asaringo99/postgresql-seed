-- pテーブルの作成
CREATE TABLE p (
    id SERIAL PRIMARY KEY,
    name TEXT
);

-- sテーブルの作成 (pテーブルに外部キーを持つ)
CREATE TABLE s (
    id SERIAL PRIMARY KEY,
    name TEXT,
    p_id INT REFERENCES p(id)
);

-- aテーブルの作成 (sとpテーブルに外部キーを持つ)
CREATE TABLE a (
    id SERIAL PRIMARY KEY,
    name TEXT,
    s_id INT REFERENCES s(id),
    p_id INT REFERENCES p(id)
);

-- bテーブルの作成 (sテーブルに外部キーを持つ)
CREATE TABLE b (
    id SERIAL PRIMARY KEY,
    name TEXT,
    s_id INT REFERENCES s(id)
);

-- cテーブルの作成 (pテーブルに外部キーを持つ)
CREATE TABLE c (
    id SERIAL PRIMARY KEY,
    name TEXT,
    p_id INT REFERENCES p(id)
);

-- xテーブルの作成 (aとbテーブルに外部キーを持つ)
CREATE TABLE x (
    id SERIAL PRIMARY KEY,
    name TEXT,
    a_id INT REFERENCES a(id),
    b_id INT REFERENCES b(id)
);

-- yテーブルの作成 (aとcテーブルに外部キーを持つ)
CREATE TABLE y (
    id SERIAL PRIMARY KEY,
    name TEXT,
    a_id INT REFERENCES a(id),
    c_id INT REFERENCES c(id)
);

-- zテーブルの作成 (aとcテーブルに外部キーを持つ)
CREATE TABLE z (
    id SERIAL PRIMARY KEY,
    name TEXT,
    a_id INT REFERENCES a(id),
    c_id INT REFERENCES c(id)
);
