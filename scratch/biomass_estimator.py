import argparse
import sys

class OrnamentalBiomassCarbonEstimator:
    """조경/관상목 대상 산림 바이오매스 기반 탄소 산정 엔진 클래스"""
    
    def __init__(self):
        self.F = 0.45               # 임분형수
        self.BEF = 1.3              # 바이오매스 확장계수
        self.R = 0.25               # 뿌리 함량비
        self.CF = 0.5               # 탄소 전환계수
        self.CO2_RATIO = 44 / 12    # CO2 당량 변환 상수
        self.PI = 3.141592          # 파이(원주율)
        
        # 관상목 수종별 기본 밀도 (kg/m^3)
        self.DENSITIES = {
            "배롱나무": 650, "왕벚나무": 600, "목련": 500, "단풍나무": 650,
            "복자기나무": 700, "소나무": 420, "반송": 420, "주목": 650,
            "낙상홍": 550, "꽃댕강나무": 550, "개나리": 500
        }
        self.DEFAULT_DENSITY = 500
        
    def calculate_co2_absorption(self, species: str, dbh_cm: float, height_m: float) -> dict:
        rho = self.DENSITIES.get(species, self.DEFAULT_DENSITY)
        v = round(self.PI * ((dbh_cm / 200) ** 2) * height_m * self.F, 4)
        w = round(v * rho, 4)
        b_total = round(w * self.BEF * (1 + self.R), 4)
        c = round(b_total * self.CF, 4)
        co2e = round(c * self.CO2_RATIO, 4)
        return {
            "species": species, "dbh_cm": round(dbh_cm, 2), "height_m": round(height_m, 2),
            "density_kg_m3": rho, "step1_volume_m3": v, "step2_stem_dry_weight_kg": w,
            "step3_total_biomass_kg": b_total, "step4_carbon_storage_kg": c,
            "step5_co2_equivalent_raw": co2e, "final_co2_absorption_kg": round(co2e, 2)
        }
        
    def estimate_carbon_with_environment(self, species: str, diameter_cm: float, env_data: dict) -> dict:
        # 관목류(개나리, 반송 등)는 높이 비율을 낮춤
        if species in ["개나리", "꽃댕강나무", "낙상홍", "반송"]:
            height_m = diameter_cm * 0.25
        else:
            height_m = diameter_cm * 0.4
            
        result = self.calculate_co2_absorption(species, diameter_cm, height_m)
        result["environmental_data"] = env_data
        result["environment_note"] = "※ 토양 및 외부 대기 데이터는 생육 모니터링 메타데이터로 저장됩니다."
        return result

def run_interactive_mode():
    engine = OrnamentalBiomassCarbonEstimator()
    print("\n=========================================================")
    print(" [관상목 대상 스마트 산림 바이오매스 탄소 산정 엔진] ")
    print("=========================================================\n")
    print("[지원 수종]: 배롱나무, 왕벚나무, 목련, 단풍나무, 복자기나무, 소나무, 반송, 주목, 낙상홍, 꽃댕강나무, 개나리\n")
    
    try:
        species = input("▶ 수종을 입력하세요 (예: 왕벚나무) [기본값: 왕벚나무]: ").strip()
        if not species: species = "왕벚나무"
            
        diameter = float(input(f"▶ {species}의 직경을 입력하세요 (단위: cm): "))
        
        print("\n[토양 환경 데이터 입력]")
        soil_ec = float(input("  - 토양 EC (전기전도도, dS/m): "))
        soil_temp = float(input("  - 토양 온도 (°C): "))
        soil_hum = float(input("  - 토양 습도 (%): "))
        soil_ph = float(input("  - 토양 pH: "))
        
        print("\n[외부 환경 데이터 입력]")
        ext_temp = float(input("  - 외부 온도 (°C): "))
        ext_hum = float(input("  - 외부 습도 (%): "))
        
        env_data = {
            "soil_ec_ds_m": soil_ec, "soil_temp_c": soil_temp, "soil_humidity_perc": soil_hum,
            "soil_ph": soil_ph, "external_temp_c": ext_temp, "external_humidity_perc": ext_hum
        }
        
        print("\n⏳ 데이터를 분석하여 탄소 흡수량을 산출하고 있습니다...\n")
        print_result(engine, species, diameter, env_data)
        
    except ValueError:
        print("\n❌ 입력 오류: 직경 및 모든 온/습도, pH, EC 값은 반드시 숫자로 입력해 주세요.")
    except Exception as e:
        print(f"\n❌ 알 수 없는 오류가 발생했습니다: {e}")

def print_result(engine, species, diameter, env_data):
    result = engine.estimate_carbon_with_environment(
        species=species, diameter_cm=diameter, env_data=env_data
    )
    print("=== [결과] 조경/관상목 바이오매스 탄소 산정 리포트 ===")
    print(f"[입력된 물리 및 환경 정보]")
    print(f"  - 수종명: {result['species']}")
    print(f"  - 입력 직경: {result['dbh_cm']} cm")
    print(f"  - 자동 추정 수고: {result['height_m']} m (관상목 직경 비례 추정)")
    print(f"  - 토양 상태: EC {env_data['soil_ec_ds_m']} / 온도 {env_data['soil_temp_c']}°C / 습도 {env_data['soil_humidity_perc']}% / pH {env_data['soil_ph']}")
    print(f"  - 대기 상태: 온도 {env_data['external_temp_c']}°C / 습도 {env_data['external_humidity_perc']}%")
    print(f"  - {result['environment_note']}\n")
    
    print(f"[5단계 연산 도출 과정]")
    print(f"  - Step 1. 임목 재적(V)       : {result['step1_volume_m3']:.4f} m³")
    print(f"  - Step 2. 줄기 건조 중량(W)  : {result['step2_stem_dry_weight_kg']:.4f} kg")
    print(f"  - Step 3. 총 바이오매스(B)   : {result['step3_total_biomass_kg']:.4f} kg")
    print(f"  - Step 4. 탄소 저장량(C)     : {result['step4_carbon_storage_kg']:.4f} kg")
    print(f"  - Step 5. 이산화탄소 당량    : {result['step5_co2_equivalent_raw']:.4f} kg\n")
    
    print(f"=====================================================")
    print(f"[최종 CO2 흡수량]: {result['final_co2_absorption_kg']} kg")
    print(f"=====================================================\n")

if __name__ == "__main__":
    # 인자 없이 단순히 python biomass_estimator.py 로 실행한 경우 대화형 모드 작동
    if len(sys.argv) == 1:
        run_interactive_mode()
    else:
        # 인자가 있는 경우 CLI 옵션 모드 작동
        parser = argparse.ArgumentParser(description="관상목 스마트 산림 바이오매스 탄소 산정 엔진 CLI")
        
        # 필수 인자
        parser.add_argument("--species", type=str, required=True, help="수종 (예: 왕벚나무, 단풍나무, 개나리 등)")
        parser.add_argument("--diameter", type=float, required=True, help="나무의 직경 (단위: cm)")
        
        # 선택 인자
        parser.add_argument("--soil-ec", type=float, default=0.0, help="토양 EC (전기전도도, dS/m)")
        parser.add_argument("--soil-temp", type=float, default=0.0, help="토양 온도 (°C)")
        parser.add_argument("--soil-hum", type=float, default=0.0, help="토양 습도 (%)")
        parser.add_argument("--soil-ph", type=float, default=0.0, help="토양 pH")
        parser.add_argument("--ext-temp", type=float, default=0.0, help="외부 온도 (°C)")
        parser.add_argument("--ext-hum", type=float, default=0.0, help="외부 습도 (%)")

        args = parser.parse_args()

        engine = OrnamentalBiomassCarbonEstimator()
        
        env_data = {
            "soil_ec_ds_m": args.soil_ec, "soil_temp_c": args.soil_temp, "soil_humidity_perc": args.soil_hum,
            "soil_ph": args.soil_ph, "external_temp_c": args.ext_temp, "external_humidity_perc": args.ext_hum
        }
        
        print("\n=========================================================")
        print(" [관상목 대상 스마트 산림 바이오매스 탄소 산정 엔진] ")
        print("=========================================================\n")
        print_result(engine, args.species, args.diameter, env_data)
