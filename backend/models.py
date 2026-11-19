from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String

from database import Base


class AlarmaDB(Base):
    """Una fila por cada fila del CSV cargado (el ID puede repetirse en el documento)."""

    __tablename__ = "alarmas_paginadas"

    pk = Column(Integer, primary_key=True, autoincrement=True)
    id_alarma = Column("ID_ALARMA", String(50), nullable=False)
    tech_2g = Column("2G", Float, nullable=True)
    tech_3g = Column("3G", Float, nullable=True)
    tech_4g = Column("4G", Float, nullable=True)
    fecha_creacion = Column("FECHA_CREACION", DateTime, nullable=False, index=True)  # UTC sin zona
    fecha_original = Column("FECHA_ORIGINAL", String(80), nullable=True)  # texto tal como venía en el documento
    municipio = Column("MUNICIPIO", String(100), nullable=True)
    departamento = Column("DEPARTAMENTO", String(100), nullable=True)
    notificada = Column("NOTIFICADA", String(1), nullable=False)
    
    # La condición base no depende del tiempo: se calcula al subir. El nivel se calcula al consultar.
    cumple_base = Column("CUMPLE_BASE", Boolean, nullable=False)
    motivo = Column("MOTIVO", String(120), nullable=False)
    busqueda = Column("BUSQUEDA", String(300), nullable=False)  # id, municipio y departamento sin tildes, en minúsculas


class LoteDB(Base):
    """Lote vigente (una sola fila). batch_id sube en cada carga; las consultas de páginas lo validan."""

    __tablename__ = "lote_actual"

    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, nullable=False)
