from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Ruta absoluta junto a este archivo: no depende de la carpeta desde donde se levante uvicorn.
DATABASE_URL = f"sqlite:///{Path(__file__).resolve().parent / 'alarmas.db'}"

# timeout: si otra subida está escribiendo, esperar el bloqueo de SQLite en vez de fallar.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():  # FastAPI abre una sesión por petición y la cierra al terminar
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
