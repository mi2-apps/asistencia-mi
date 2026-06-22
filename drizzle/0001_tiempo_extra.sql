CREATE TABLE IF NOT EXISTS tiempo_extra (
  id              SERIAL PRIMARY KEY,
  colaborador_id  INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  hora_inicio     VARCHAR(5) NOT NULL,
  hora_fin        VARCHAR(5) NOT NULL,
  horas_totales   NUMERIC(4,2) NOT NULL,
  area            VARCHAR(100) NOT NULL,
  motivo          TEXT NOT NULL,
  autorizado_por  VARCHAR(100) NOT NULL,
  registrado_por  VARCHAR(60) NOT NULL,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiempo_extra_colaborador ON tiempo_extra(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_tiempo_extra_fecha       ON tiempo_extra(fecha);
