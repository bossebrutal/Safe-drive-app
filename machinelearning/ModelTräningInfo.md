# Modellträningsinfo

Denna guide beskriver hur du pausar och återupptar träning av Ultra-Fast-Lane-Detection-modellen, samt hur checkpoint-filer hanteras.

---

## 1. Checkpoint-filernas placering och namn

När du kör träningsskriptet (`train.py`) sparas modellvikter och optimizer-tillstånd vid slutet av varje epok i en tidsstämplad “run”-mapp. Typisk katalogstruktur:

        /home/patrikwinkler/CULaneLogs/ufld_culane_res50/
            └── 20250603_130932_lr_1e-01_b_32/ ← en “run”-mapp som skapades i början
            ├── events.out.tfevents.… ← TensorBoard-loggar för hela run
            ├── ep000.pth ← checkpoint för epok 0 (första epoken)
            ├── ep001.pth ← checkpoint för epok 1 (andra epoken)
            ├── ep002.pth ← checkpoint för epok 2
            ├── … ← och så vidare för varje epok
            ├── cfg
            └── … (ev. kataloger som backups/, etc.)



- Filen `ep000.pth` sparas så snart epok 0 är klar.
- När epok 1 är klar skapas filen `ep001.pth`, etc.
- Alla checkpoint-filer (vikter + optimizer-state) hamnar i samma tidsstämplade mapp, under roten för det aktuella “run”.

---

## 2. Hur pausar man träningen (Ctrl + C)

- Om du trycker **Ctrl + C** under en omgång minibatcher (d.v.s. mitt i en epok), avbryts träningen omedelbart.  
- Inga nya checkpoint sparas från den pågående epoken — den senaste checkpointen som existerar är alltid den från slutet av föregående fullständiga epok.  
- Exempel:  
  - Du avslutar epok 3 (checkpoint `ep003.pth` finns).  
  - Du avbryter mitt i epok 4 (ingen `ep004.pth` skapas).  
  - `ep003.pth` är då den senaste checkpointen.

---

## 3. Återuppta träningen från en checkpoint

För att återuppta träningen utan att behöva börja om från epok 0, peka `resume` i konfigurationsfilen till den senaste checkpoint-filen:

1. Öppna `configs/culane.py`.
2. Leta reda på raden:
   ```python
    resume = None

   # RESUME MODELL FRÅN ep003.pth, ändra till senast sparade .pth
    resume  = '/home/patrikwinkler/CULaneLogs/ufld_culane_res50/20250603_130932_lr_1e-01_b_32/ep003.pth'

    #SPARA 
    'configs/culane.py'

3. Start träning.
   
    # kör kommandot:

    python train.py configs/culane.py

    # ifrån:
    (machinelearning) (base) patrikwinkler@PatrikW:~/workspace/github.com/bossebrutal/safedriveapp/machinelearning/Ultra-Fast-Lane-Detection$ 

    # VIKTIGT ATT VA I RÄTT ENVIROMENT (machinelearning)
    conda activate machinelearning

## Testa från tex ep010:

    cd ~/workspace/github.com/bossebrutal/safedriveapp/machinelearning/Ultra-Fast-Lane-Detection$ 

    mkdir tmp_eval_ep10
    
    conda activate machinelearning

    python test.py configs/culane.py \
    --test_model /home/patrikwinkler/CULaneLogs/ufld_culane_res50/20250603_130932_lr_1e-01_b_32/ep010.pth \
    --test_work_dir tmp_eval_ep10


