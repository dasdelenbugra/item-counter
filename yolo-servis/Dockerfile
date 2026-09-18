FROM python:3.11-slim

# OpenCV'nin (ultralytics bağımlılığı) ihtiyaç duyduğu sistem kütüphaneleri
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces konteyneri 1000 numaralı kullanıcıyla çalıştırır;
# root kalırsa önbellek dizinlerine yazamaz.
RUN useradd -m -u 1000 kullanici
USER kullanici
ENV HOME=/home/kullanici \
    PATH=/home/kullanici/.local/bin:$PATH \
    YOLO_CONFIG_DIR=/home/kullanici/.config/Ultralytics
WORKDIR $HOME/app

# torch'un varsayılan tekerlekleri CUDA ile gelir ve 2 GB'ı aşar.
# CPU sürümünü ayrı indeksten kurup imajı küçük tutuyoruz.
RUN pip install --no-cache-dir --user torch torchvision \
    --index-url https://download.pytorch.org/whl/cpu

COPY --chown=kullanici requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=kullanici app.py .

# Ağırlığı imaja göm: ilk istek indirmeyi beklemesin.
RUN python -c "from huggingface_hub import hf_hub_download; \
    hf_hub_download('chistopat/sku110k-yolo11-object-detector', 'weights/sku110k-yolo11-s640.pt')"

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
