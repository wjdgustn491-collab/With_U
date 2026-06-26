class BiomassCarbonEstimator:
    """산림 바이오매스 기반 탄소 산정 엔진 클래스"""
    
    def __init__(self):
        # 1. 공통 상수
        self.F = 0.45               # 임분형수
        self.BEF = 1.3              # 바이오매스 확장계수
        self.R = 0.25               # 뿌리 함량비
        self.CF = 0.5               # 탄소 전환계수
        self.CO2_RATIO = 44 / 12    # CO2 당량 변환 상수
        self.PI = 3.141592          # 파이(원주율)
        
        # 2. 수종별 기본 밀도 (kg/m^3)
        self.DENSITIES = {
            "소나무": 420,
            "참나무": 650,
            "낙엽송": 500
        }
        self.DEFAULT_DENSITY = 500  # DB에 없는 수종일 경우 기본값
        
    def calculate_co2_absorption(self, species: str, dbh_cm: float, height_m: float) -> dict:
        """기존 5단계 알고리즘: 직경과 수고를 바탕으로 탄소량 산출"""
        rho = self.DENSITIES.get(species, self.DEFAULT_DENSITY)
        
        v = round(self.PI * ((dbh_cm / 200) ** 2) * height_m * self.F, 4)
        w = round(v * rho, 4)
        b_total = round(w * self.BEF * (1 + self.R), 4)
        c = round(b_total * self.CF, 4)
        co2e = round(c * self.CO2_RATIO, 4)
        final_co2e = round(co2e, 2)
        
        return {
            "species": species,
            "dbh_cm": round(dbh_cm, 2),
            "height_m": round(height_m, 2),
            "density_kg_m3": rho,
            "step1_volume_m3": v,
            "step2_stem_dry_weight_kg": w,
            "step3_total_biomass_kg": b_total,
            "step4_carbon_storage_kg": c,
            "step5_co2_equivalent_raw": co2e,
            "final_co2_absorption_kg": final_co2e
        }
        
    def calculate_from_circumference(self, species: str, circumference_cm: float, 
                                     temp_c: float, humidity_perc: float, height_m: float = None) -> dict:
        """
        [새로운 기능] 나무의 둘레(cm)와 주변 온습도를 입력받아 탄소량을 산정합니다.
        수고가 생략될 경우 소나무의 일반적인 비율을 가설로 적용해 자동 추정합니다.
        """
        # 1. 둘레(C)를 통해 흉고직경(D) 역산: D = C / PI
        dbh_cm = circumference_cm / self.PI
        
        # 2. 수고(H)가 생략된 경우, 직경에 비례한 임의의 추정치 적용 (예: 직경의 0.5배)
        if height_m is None:
            height_m = dbh_cm * 0.5
            
        # 3. 기존 표준 탄소 산정식 호출
        result = self.calculate_co2_absorption(species, dbh_cm, height_m)
        
        # 4. 온습도 등 메타데이터 추가
        result["input_circumference_cm"] = circumference_cm
        result["environment_temp_c"] = temp_c
        result["environment_humidity_perc"] = humidity_perc
        result["environment_note"] = "※ 온습도는 현재 바이오매스 산정 공식에 직접 영향을 주진 않으나, 생육 메타데이터로 저장됩니다."
        
        return result


# ==========================================
# 터미널 대화형 인터페이스 (CLI)
# ==========================================
if __name__ == "__main__":
    import sys
    engine = BiomassCarbonEstimator()
    
    print("\n=====================================================")
    print("🌲 산림 바이오매스 기반 탄소 산정 엔진 🌲")
    print("=====================================================\n")
    
    try:
        # 1. 수종 입력 (기본값 소나무)
        species = input("▶ 수종을 입력하세요 (예: 소나무, 참나무) [기본값: 소나무]: ").strip()
        if not species:
            species = "소나무"
            
        # 2. 둘레 입력
        circumference = float(input("▶ 나무의 둘레를 입력하세요 (단위: cm): "))
        
        # 3. 온도 입력
        temp = float(input("▶ 주변 온도를 입력하세요 (단위: °C): "))
        
        # 4. 습도 입력
        humidity = float(input("▶ 주변 습도를 입력하세요 (단위: %): "))
        
        # 5. 수고(높이) 입력 (선택사항)
        height_str = input("▶ 나무의 수고(높이)를 입력하세요 (단위: m) [모를 경우 Enter를 누르면 자동 추정]: ").strip()
        height = float(height_str) if height_str else None
        
        print("\n⏳ 데이터를 분석하여 탄소 흡수량을 산출하고 있습니다...\n")
        
        # 연산 실행
        result = engine.calculate_from_circumference(
            species=species,
            circumference_cm=circumference,
            temp_c=temp,
            humidity_perc=humidity,
            height_m=height
        )
        
        # 결과 출력부
        print("=== [결과] 산림 바이오매스 탄소 산정 리포트 ===")
        print(f"[입력 정보]")
        print(f"  - 수종: {result['species']}")
        print(f"  - 입력 둘레: {result['input_circumference_cm']:.2f} cm")
        print(f"  - 환산 직경(DBH): {result['dbh_cm']} cm")
        if height is None:
            print(f"  - 자동 추정 수고: {result['height_m']} m (직경 비례 추정)")
        else:
            print(f"  - 입력 수고: {result['height_m']} m")
        print(f"  - 입력 환경: 온도 {result['environment_temp_c']} °C / 습도 {result['environment_humidity_perc']} %")
        print(f"  - {result['environment_note']}\n")
        
        print(f"[5단계 연산 도출 과정]")
        print(f"  - Step 1. 임목 재적(V)       : {result['step1_volume_m3']:.4f} m³")
        print(f"  - Step 2. 줄기 건조 중량(W)  : {result['step2_stem_dry_weight_kg']:.4f} kg")
        print(f"  - Step 3. 총 바이오매스(B)   : {result['step3_total_biomass_kg']:.4f} kg")
        print(f"  - Step 4. 탄소 저장량(C)     : {result['step4_carbon_storage_kg']:.4f} kg")
        print(f"  - Step 5. 이산화탄소 당량    : {result['step5_co2_equivalent_raw']:.4f} kg\n")
        
        print(f"=====================================================")
        print(f"🌱 최종 CO2 흡수량: {result['final_co2_absorption_kg']} kg")
        print(f"=====================================================\n")
        
    except ValueError:
        print("\n❌ 입력 오류: 둘레, 온도, 습도, 수고는 반드시 숫자로 입력해 주세요.")
    except Exception as e:
        print(f"\n❌ 알 수 없는 오류가 발생했습니다: {e}")
