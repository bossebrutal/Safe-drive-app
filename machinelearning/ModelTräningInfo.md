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
    resume  = '/home/patrikwinkler/CULaneLogs/ufld_culane_res50multi/20250605_145936_lr_1e-01_b_32/ep000.pth'

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
    --test_model /home/patrikwinkler/CULaneLogs/ufld_culane_res50multiep039/20250608_082135_lr_1e-04_b_32/ep045.pth \
    --test_work_dir tmp_eval_multi_latest_ep45

## Tensorboard
    tensorboard --logdir=/home/patrikwinkler/CULaneLogs/ufld_culane_res50multi

    tensorboard --logdir=/home/patrikwinkler/CULaneLogs/ufld_culane_res50fintuned

    tensorboard --logdir=/home/patrikwinkler/CULaneLogs/ufld_culane_finetune001

    tensorboard --logdir=/home/patrikwinkler/CULaneLogs/ufld_culane_finetune1

    tensorboard --logdir=/home/patrikwinkler/CULaneLogs/ufld_culane_res50multiep041

    tensorboard --logdir=/home/patrikwinkler/CULaneLogs/ufld_culane_res50multiep039

    tensorboard --logdir=/home/patrikwinkler/KITTILogs/runs


## DEPTH_ESIMATION MODEL CONFIG:


    python train.py \
        --model_name finetune_resnet50_kitti \
        --split eigen_zhou \
        --data_path /home/patrikwinkler/KITTIdata/kitti_raw/ \
        --log_dir /home/patrikwinkler/KITTILogs/runs \
        --num_layers 50 \
        --load_weights_folder /home/patrikwinkler/KITTILogs/runs/finetune_resnet50_kitti/models/weights_9 \
        --png \
        --batch_size 6 \
        --learning_rate 1e-5 \
        --num_epochs 8 \
        --scheduler_step_size 5 \
        --num_workers 2


## evaluate_depth.py:


    python evaluate_depth.py \
     --data_path /home/patrikwinkler/KITTIdata/kitti_raw/ \
     --eval_split eigen \
     --load_weights_folder /home/patrikwinkler/KITTILogs/runs/finetune_resnet50_kitti/models/weights_4 \
     --num_layers 50 \
     --png \
     --eval_mono