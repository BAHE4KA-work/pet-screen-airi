import os
import asyncio
from typing import List, Dict, Any
from services.shared.logger import setup_logger

logger = setup_logger("Vector-Embedder")

class VectorEmbedder:
    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5"):
        self.model_name = model_name
        self.model = None

    def initialize(self):
        try:
            from fastembed import TextEmbedding
            self.model = TextEmbedding(model_name=self.model_name)
            logger.info(f"Vector embedding model '{self.model_name}' initialized.")
        except Exception as e:
            logger.warning(f"fastembed not initialized ({e}). Using deterministic vector projection.")

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if self.model:
            embeddings_generator = self.model.embed(texts)
            return [list(e) for e in embeddings_generator]
        else:
            # Deterministic mock vectors (384-dim)
            return [[0.05 * (i % 10) for i in range(384)] for _ in texts]

embedder = VectorEmbedder()

if __name__ == "__main__":
    embedder.initialize()
    vecs = embedder.embed_texts(["Проверить статус системы", "Записать заметку"])
    logger.info(f"Generated {len(vecs)} embeddings of dimension {len(vecs[0])}")
