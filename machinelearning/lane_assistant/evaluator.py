import cv2
import numpy as np
import os
import csv
from sklearn.cluster import DBSCAN

def evaluate_lane_position(image_path, debug=True):
    img = cv2.imread(image_path)
    h, w, _ = img.shape

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lower_purple = np.array([140, 150, 150])
    upper_purple = np.array([160, 255, 255])
    purple_mask = cv2.inRange(hsv, lower_purple, upper_purple)

    if debug:
        cv2.imshow("Purple Mask", purple_mask)

    contours, _ = cv2.findContours(purple_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    points = []
    for cnt in contours:
        x, y, w_box, h_box = cv2.boundingRect(cnt)
        if w_box > 1 and h_box > 1:
            center_x = x + w_box // 2
            center_y = y + h_box // 2
            points.append([center_x, center_y])
    print(f"📍 Found {len(points)} purple lane points in: {image_path} center_x_ {center_x}, center_y_ {center_y}")

    # Klustrar punkter till lanes med avstånd i både x och y
    lane_clusters = {}
    if len(points) >= 2:
        scaled_points = [[x * 3, y] for x, y in points]
        db = DBSCAN(eps=100, min_samples=2).fit(scaled_points)
        labels = db.labels_
        unique_labels = set(labels)
        print(f"🔍 DBSCAN labels: {unique_labels} in {image_path}")
        for label, pt in zip(labels, points):
            if label == -1:
                continue
            lane_clusters.setdefault(label, []).append(pt)

    lane_count = len(lane_clusters)
    mid_x = w // 2
    position = "unknown"

    print(f"🧩 Total lane clusters found: {len(lane_clusters)}\n")
    # Räkna ut mittpunkterna i x för varje kluster
    cluster_centers_x = []
    for cluster in lane_clusters.values():
        x_vals = [pt[0] for pt in cluster]
        if len(x_vals) >= 2:
            avg_x = int(np.mean(x_vals))
            cluster_centers_x.append(avg_x)

    cluster_centers_x.sort()
    lane_count = len(cluster_centers_x)

    if lane_count >= 2:
        for i in range(lane_count - 1):
            if cluster_centers_x[i] < mid_x < cluster_centers_x[i + 1]:
                position = "center"
                break
        if mid_x < cluster_centers_x[0]:
            position = "left"
        elif mid_x > cluster_centers_x[-1]:
            position = "right"
    elif lane_count == 1:
        position = "single_lane_detected"

    # Debug: Rita varje kluster som en linje
    if debug:
        for cluster in lane_clusters.values():
            if len(cluster) >= 2:
                pts = np.array(cluster)
                xs = pts[:, 0]
                ys = pts[:, 1]
                try:
                    k, m = np.polyfit(xs, ys, 1)
                    y1, y2 = 0, h
                    x1 = int((y1 - m) / k)
                    x2 = int((y2 - m) / k)
                    cv2.line(img, (x1, y1), (x2, y2), (0, 255, 255), 2)
                except np.RankWarning:
                    continue

        cv2.line(img, (mid_x, 0), (mid_x, h), (255, 0, 0), 2)
        cv2.imshow("Analysis", img)
        cv2.waitKey(0)
        cv2.destroyAllWindows()

    return {
        'lane_count': lane_count,
        'position': position
    }



def evaluate_folder(image_path="machinelearning/lane_assistant/test_data", save_csv=True):
    """
    Utvärderar alla lane-predikterade bilder i en mapp.
    """
    results = []
    valid_exts = ('.png', '.jpg', '.jpeg')
    img_files = [f for f in os.listdir(image_path) if f.lower().endswith(valid_exts)]

    for file in sorted(img_files):
        full_path = os.path.join(image_path, file)
        eval_result = evaluate_lane_position(full_path)
        eval_result['image'] = file
        results.append(eval_result)
        print(f"{file}: {eval_result}")

    if save_csv:
        csv_path = os.path.join(image_path, "evaluation_results.csv")
        with open(csv_path, mode='w', newline='') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=['image', 'lane_count', 'position'])
            writer.writeheader()
            for row in results:
                writer.writerow(row)
        print(f"\n📄 Resultat sparade i: {csv_path}")

    return results


# 📌 Gör scriptet körbart direkt
if __name__ == "__main__":
    folder = "machinelearning/lane_assistant/test_data"
    evaluate_folder(image_path=folder)
