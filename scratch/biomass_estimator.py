class ESGCarbonCalculator:
    """
    글로벌 ESG 표준(GHG Protocol) 기반 온실가스 배출량 및
    조경/산림 탄소 흡수량(Offset) 산정 통합 모듈 클래스
    """

    def __init__(self):
        # 1. 배출계수(Emission Factors) DB 초기화 (단위: kgCO2eq)
        self.emission_factors = {
            "electricity": 0.46,    # 전력 (Scope 2) - per kWh
            "gasoline": 2.15,       # 휘발유 (Scope 1 - 이동) - per L
            "lng": 2.2,             # LNG (Scope 1 - 고정) - per Nm^3
            "waste": 500.0          # 폐기물 매립 (Scope 3) - per ton
        }

        # 2. 바이오매스(탄소 흡수량) 관련 상수
        self.F = 0.45               # 임분형수
        self.BEF = 1.3              # 바이오매스 확장계수
        self.R = 0.25               # 뿌리 함량비
        self.CF = 0.5               # 탄소 전환계수
        self.CO2_RATIO = 44 / 12    # CO2 당량 변환 상수
        self.PI = 3.141592          # 파이(원주율)
        self.DEFAULT_DENSITY = 500  # 관상목 기본 밀도 (kg/m^3)

    def calc_scope1(self, gasoline_l: float, lng_nm3: float) -> float:
        return (gasoline_l * self.emission_factors["gasoline"]) + (lng_nm3 * self.emission_factors["lng"])

    def calc_scope2(self, electricity_kwh: float) -> float:
        return electricity_kwh * self.emission_factors["electricity"]

    def calc_scope3(self, waste_ton: float) -> float:
        return waste_ton * self.emission_factors["waste"]

    def calc_offset_biomass(self, species: str, dbh_cm: float, height_m: float) -> float:
        # Step 1~5 산림청/IPCC 5단계 알고리즘 적용
        volume = self.PI * ((dbh_cm / 200) ** 2) * height_m * self.F
        dry_weight = volume * self.DEFAULT_DENSITY
        total_biomass = dry_weight * self.BEF * (1 + self.R)
        carbon_storage = total_biomass * self.CF
        co2_absorption = carbon_storage * self.CO2_RATIO
        return co2_absorption

    def generate_net_zero_report(self, gasoline_l, lng_nm3, electricity_kwh, waste_ton, trees_data) -> dict:
        scope1 = self.calc_scope1(gasoline_l, lng_nm3)
        scope2 = self.calc_scope2(electricity_kwh)
        scope3 = self.calc_scope3(waste_ton)
        total_emissions = scope1 + scope2 + scope3

        total_offset = 0.0
        total_trees_count = 0
        
        # 수목 그룹별로 흡수량을 계산하고 수량(quantity)을 곱해 합산
        for group in trees_data:
            qty = group.get('quantity', 1)
            # 단일 수목의 흡수량 계산
            single_absorption = self.calc_offset_biomass(group['species'], group['dbh_cm'], group['height_m'])
            # 수량만큼 곱해서 총 상쇄량에 더함
            total_offset += (single_absorption * qty)
            total_trees_count += qty

        net_emissions = total_emissions - total_offset

        print("\n" + "=" * 55)
        print(" [기업 온실가스 인벤토리 및 순 배출량(Net Zero) 리포트] ")
        print("=" * 55)
        print("[1] 온실가스 배출 내역 (Emissions)")
        print(f"  - Scope 1 (직접 배출 - 휘발유, LNG) : {scope1:,.2f} kgCO2eq")
        print(f"  - Scope 2 (간접 배출 - 구매 전력)   : {scope2:,.2f} kgCO2eq")
        print(f"  - Scope 3 (기타 간접 - 폐기물 매립) : {scope3:,.2f} kgCO2eq")
        print("-" * 55)
        print(f"  ▶ 총 온실가스 배출량 (Total)        : {total_emissions:,.2f} kgCO2eq")
        print("\n[2] 탄소 상쇄 내역 (Offsets)")
        print(f"  - 등록된 조경/산림 수목 수량        : {total_trees_count:,} 그루")
        print(f"  ▶ 총 탄소 흡수량 (Total Offset)    : {total_offset:,.2f} kgCO2eq")
        print("=" * 55)
        print(f"[최종 순 배출량] (Net Carbon Footprint)")
        print(f"   => {net_emissions:,.2f} kgCO2eq")
        print("=" * 55 + "\n")

        return {
            "scope1": scope1, "scope2": scope2, "scope3": scope3,
            "total_emissions": total_emissions, "total_offset": total_offset, "net_emissions": net_emissions
        }

if __name__ == "__main__":
    import sys

    calculator = ESGCarbonCalculator()
    
    print("\n=======================================================")
    print(" [기업 ESG 온실가스 & 탄소 상쇄(Net Zero) 데이터 입력] ")
    print("=======================================================\n")
    
    try:
        # 기업 배출량 기초 데이터 입력
        print("[1. 온실가스 배출량 기초 데이터 입력]")
        gasoline_l = float(input("▶ 법인차량 휘발유 총 사용량 (L) : "))
        lng_nm3 = float(input("▶ 난방/보일러 LNG 총 사용량 (Nm3): "))
        electricity_kwh = float(input("▶ 사업장 총 전력 사용량 (kWh)   : "))
        waste_ton = float(input("▶ 사업장 폐기물 발생량 (ton)    : "))
        
        # 사내 조경 수목 데이터 개별 입력 (군락/그룹 단위 처리)
        print("\n[2. 상쇄(Offset)를 위한 사내 조경 수목 데이터 입력]")
        print("💡 수목을 하나씩 등록하지 않고, 같은 종류의 나무를 '그룹'으로 묶어서 등록합니다.")
        group_count = int(input("▶ 등록할 수목의 '그룹(종류)' 개수를 입력하세요 (0이면 없음) : "))
        
        company_trees = []
        for i in range(group_count):
            print(f"\n--- 수목 그룹 #{i+1} 정보 입력 ---")
            species = input("   수종명 (예: 소나무, 왕벚나무) : ").strip()
            if not species: species = "소나무"
            
            quantity = int(input(f"   해당 수종({species})을 몇 그루 심었습니까? : "))
            dbh = float(input(f"   평균 흉고직경 또는 직경 (cm)  : "))
            
            # 수고(높이) 모를 시 자동 추정 로직
            height_str = input("   평균 수고(높이) (m) [모르면 Enter를 쳐서 직경 비례 자동 추정] : ").strip()
            if height_str:
                height = float(height_str)
            else:
                if species in ["개나리", "꽃댕강나무", "낙상홍", "반송"]:
                    height = dbh * 0.25
                else:
                    height = dbh * 0.4
                print(f"   * 수고 자동 추정 적용: {height:.2f} m")
                
            company_trees.append({
                "species": species,
                "quantity": quantity,
                "dbh_cm": dbh, 
                "height_m": height
            })
            
        print("\n⏳ 모든 데이터를 취합하여 기업 Net Zero 리포트를 생성 중입니다...\n")
        
        # 넷제로 리포트 생성 및 순 배출량 산출 실행
        result = calculator.generate_net_zero_report(
            gasoline_l=gasoline_l,
            lng_nm3=lng_nm3,
            electricity_kwh=electricity_kwh,
            waste_ton=waste_ton,
            trees_data=company_trees
        )
        
    except ValueError:
        print("\n❌ 입력 오류: 사용량 및 직경, 수고, 수량은 반드시 '숫자'만 입력해 주세요.")
    except Exception as e:
        print(f"\n❌ 알 수 없는 오류가 발생했습니다: {e}")
