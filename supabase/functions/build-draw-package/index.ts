import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET     = "draw-packages";

// logo-pdf@2x.png from src/assets/brand/ — embedded so no runtime asset fetch needed
const LOGO_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAlgAAAE2CAYAAAC9cOxrAAAACXBIWXMAAEJwAABCcAFu8l9tAAAfnUlEQVR4nO3dCfAkZX2HcQ5ZlkOQSxDRDYjHasQLKbwQBUQJUUGjRhI8UAyHeBJC4rF4JBCjiUKIQMQAIiAJYogiAREQkcgqqERFkAgKqMghoijr8qReeP9lM/Y509d0P5+qqdqdme63p6d3+rtvv/17V1lFkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJktRvwE7h0fV2SJIkDQKwD3A3sAI4oOvtkSRJmlvAqsAyft+HgdW73j5JkqS5AqwLnEm2s4H1ut5OSZKkuQA8FFhOsW8CS7reXkmSpF4Dngj8kPJuBLbrerslSZJ6CXgZ8CuqC8u8rOvtlyRJ6ttg9ncA9+SEqFvjI8s9cR2rdv15JEmSOgWsCZxQ0EN1DbAU2Br4bsF7TwXW8muVJEmjBGwEXFAQmC4GNkkssyFwfsEylwCbdvvpJEmSWgY8EriqICgdDyxKWfYBwNEFy14LPM4vVpIkjQKwC3BbwXiqZSXW8yZgZc567gB2b+dTSZIkdQTYN057k+VOYI8K69stBqksvwUOavZTSZIkdSBMbQMcXnBZ7wZg2ynWvQ1wXcG6jwHWaObTSZIkdTPtzVkFAegK4OEztLE5cFlBG+cA69f76SRJkloGbAFcXhB8zgDWqaGtxcApBW1dCWxZz6eTJElqGbA98OOCwPNhYLWai5YuK2jzZ8AOdbUpSZLUl2lvfgO8usH2XwHcldP+r4G9m2pfkiRplZp7kA4pmPbmFmDHpnc78HTgJznbcU8ceF9bD5okSVIT0958ouDy3NXAo9va9cBWwLcLtul0YO22tkmSJKkUYGPgSwVB5jxgg7Z3KfBA4LMF23YpsFnb2yZJkpQKeDzwg4IAc1yXdaji9DpHFWzjj4And7WNkiRJ9wJ2BW4vqKR+SM8qya/I2d5fAC/sejslSdJIzWtYmbdQKEmSRmAIl9vm4bKmJEkaiSENGO/zwHxJkjQSXZY8iNPgLB5DaQlJkjQSXRbtjBM5h16xr88yIfQ8FEeVJEkj0eW0M2EcF3B9oq0bwxyHQ5zeR5IkjUDXEycDe2UEnhDoXjuUCaolSdJIxDFPpxQEjSuBLRtoe/V4ubHIMU3c5QdsAVxe0PYZwDp1ty1JkgYqjnm6rCBgnAOs30DbG8U798oK792oge1YFziroO0rmhgTJkmSBgbYBriuo56jUJvq+1QXxmg9paOetBuAbetuW5IkDQSwG3BHQYXzgxpqe89Y+T3LCfGRJSy7Z4MV6+/OaftOYI8m2pYkSXMMeBOwMidEhOC1e4MlElaWmbamIOw0WSpiF+C2nP0T2l5Wd7uSJGl+p705mnzXAo9raJzTfxTUntolZbkdgJ/mLPdfDY0PexRwVcG+Oh5YVHfbkiRpTgAbAucXBIZLgE0baPsRwLdy2v1uXvX0kss/pqFB+BcU7LOLgU3qbluSJPUcsHUMIXlOBdZqoO1aeqCm7QGraXqdvPFgwTXA0rrbliRJPQU8E7i5aDxRGB/VQNu1jqGqOoar5XFrtwI7NdG2JEnqEWCfgjviQpX0vRrq9Qnjk/LuAnzJDOvfHfh5zvo/2VBv3EuBX+a0uwI4oO52JUnS/Ex7cxOwXYOTNefVsXpyC3W0mpos+onAD0tMr7N63W1LkqSOxLFKZxYEgG8CS1qYrHnShcCDax64f25Oe41MFg08FFhesI/PBtaru21JktSyeOL/Whcn/pzJmpuuCF9Ugb2RyaK7DLKSJKklXV266irg9CHgdXkpVpIkNayrwdddXaLryyXKrm8mkCRJDemqfECJQeZfa2KQeclB9l/pYLLozsphSJKkARTALFEm4eQmyiRU3Dcfa6pMRB8LukqSpDmdwqXLQp/T6GKy6C6nJJIkSbNNQvy9tich7mqqmll1MVl0l5NqS5KkikKAAW4rGufTt8mau9bhZNFF4+PuCJdb625XkiTVc7kruBPYYwg9QE3ocLLo3WKQIuey6kF1tytJkmarMxXcAGw7hDFMsd2lDQ3O72QMGbANcF3Bd9hIIVZJkpTe63JWwYn5irrLITQ9WXOJEPQF4KKmShp0MVl0LB9xWcF3ec489AZKkjS3gC2AywtOyGcA68zjZM0FRTsX7NNgO61PFg0sBk4p+E6vBLass11JknTfiXh74Mclpr1ZbQiV0CfKT9w8MS6qyfZar0Rfcnqdn4Wxb3W2K0nSqAEvK5hT7zfAq4cyWfPENpyY0u6JDbfZ1WTRrwDuKmh377rblSRpVBIDsMPg8SyhR2fHgU7W/Oycz77zQCeLfjrwk5w2G7uRQJKkwYuDyj9BvqvrrjXVl8ma49ikvOKp4bXFLWxH65dIga2Abxd896cDa9fZriRJgwZsDHyp4AR7HrDBUCdrBt5DsfcMdbJo4IHAZws+f7jxYLM625UkaZBiyPlBwYn1uAYuTfVmsuY49U+4DFkkjD177FAni47T6xxVsA9+1OQdnJIkzT3g+QUhp/ail32brDluz4UZYSo8Jl3YVG2sHk0WHdpcURDuXlRnm5IkDULJk+gLhz5Z80TNq6TDci4b7jOCyaJ3BW7PabPVICxJUq91dRmoj5M1p9S8ut+A9niZ7jsprzdaG6svk0V3dflYkqS50tVA5r5O1pxR8+p+JRlySjec2MH2tt4D2NUNEJIkzYWubsXvarLmEtuVFZxOmCaItbjdrY9h66qEhyRJvQY8o+1ikl1O1lxy20pf+su5lHh1G7Wx+jBZdIUitM+pq01JknoL+NO2p0PperLmEtuXNXj9tVMMhm+lNlaPJovuZBolSZJ6oasJfbuerHmGmlcX5ZVfiPvzC13WxurRZNGdTAQuSVKn4h1wpxScAK8EthzaZM0F2zdTSJo2nDWti7kcgS2AywuOsTOAdepsV5KkTsTLc5cVnPjOqfOuvb5M1jxLzasK6+hFbaw+BNx4V+NZBcfaFW1NdyRJUiOAbYDrCk54dZ9kezFZ86w1ryqspze1sfpwibZEuA5uALatq01JkloD7AbckXOSC7fvHzTUyZqL1FlqoU+1sXo0WXReOY7gTmCPOtuUJKlRwJty6iIRg9fuQ52suc6aVxXW2ZvaWD2aLHoX4LacNsN3sKzONiVJamnam38h37XA44Y6WXNXl/T6WBurD4Ve440AVxUck6E+2qK62pQkaZWaxz6dX3AiuwTYdMiTNTdR86rCuntXG6sPUxXF8HlBwbF5MbBJXW1KkjQzYOs4uW+eU2uu5N27yZq7LqvQ19pYfZgsOvYcnlBwjF4DLK2rTUmSpgY8M+PS1P3GudRZl6mvkzX3Ifz0tTZWjyaLLhofeCuwU51tSpJUCfC6gju1wol+rzFM1txGzash1MbqyWTRLwV+mXPcrgAOqLNNSZJKAd5LvpuA7cYwWXNbNa+GUhurJ5NFbxeP0Tzvras9SZJKAZbnnJi+CSwZy2TNfSyh0PfaWH2YLBp4aMFxvLyutiRJKiXnxHQ2sF7NlcBD9fUs54Ueor5+bU3UvBpKbayc3r7wnWa5sc4wHceBnWnAkiT1OWCFy1Kr19xOGCDfy8ma+36pbl5qY00x3c2yBtpL+57swZIk9SJg1X5CyghYvZisucuaV0OrjVVxsuhl83o8S5LU54D1/r5/PX0plzBPtbHShO/agCVJGo2OA1av54/rW6jpS9jr8/dvD5YkqRcMWP2oeTXE2lhJBixJ0qgYsPpR82peBtxPy4AlSRoVA9b8lUaY09pYXiKUJI2HAatfNa+GEADTGLAkSaNiwJrPS3DzVhvLgCVJGhUDVv9qXg2xNpYBS5I0Kgas+S2D0LcyEnkMWJKkUTFgzV9YmcdQaMCSJI2KAau/Na+GVBvLgCVJGhUDVn9rXg1pYL4BS5I0Kgas+St5MI+1sQxYkqRRGXvAmoeaV0MIigYsSdKojDlgzcOltaHUxjJgSZJGZeQBa25qXs17bSwDliRpVMYasOalvMFQyk0YsCRJozLGgNXXEDLk8GjAkiSNykgD1tzWvJrX2lgGLEnSqIwtYM17zat5HcBvwJIkjcoIA9ahKdsRyjTstMrAhM+UUYLi0A62pZXvv63jWZKkXCMMWGnbcdoqAxU+W4/3uwFLkjRMBqxuAkdbeh5sDViSpGEyYBmwWjrODFiSpPEwYBmwWjrODFiSpPEwYBmwWjrODFiSpPEwYBmwWjrODFiSpPEwYBmwWjrODFiSpPEwYBmwWjrODFiSpPEwYBmwWjrODFiSpPEwYBmwWjrODFiSpPEwYBmwWjrODFiSpPEwYBmwWjrODFiSpPEwYN3rCGA/4JCBPfaLn825CCVJapMB6163M1xpn83JniVJapIBa5QMWJIkNcmANUoGLEmSmmTAupeXCBvmIHdJ0qgYsO43yP3wgT0c5H6f5V3/O5MkjYwBq5tLZkPrOerLdrR1PEuSlMuAZcBqgwFLkjQqBiwDVkvHmT1YkqTxMGAZsFo6zgxYkqTxMGAZsFo6zgxYkqTxMGAZsFo6zgxYkqTxMGAZsFo6zgxYkqTxMGAZsFo6zgxYkqTxMGDd61zgkCkeoZDnhi18RxvGtqbZxvDZrIMlSVKbDFgz+0GTISuGq9BGnSw0KklSkwxYtdi/we9nf+pnwJIkqUkGrFoYsIqPM8dgSZLGw4A1My8RljvODFiSpPEYYcDaGTi8pkfbg9zr2u6dm97mlM9gwJIkjcfYApa6YcCSJI2KAUstHWf2YEmSxsOApZaOMwOWJGk8DFhq6TgzYEmSxsOApZaOMwOWJGk8DFhq6TgzYEmSxsOApZaOMwOWJGk8DFhq6TgzYEmSxsOApZaOMwOWJGk8DFhq6TgzYEmSxsOApZaOMwOWJGk8DFhq6TgzYEmSxsOApZaOMwOWJGk8DFhq6TgzYEmSxqPjgHUucIiPUeyD8F1PWjavx7MkSX0OWBo3A5YkaZgMWDJgSZJUMwOWDFiSJNXMgCUDliRJ8xuwdgYO9+E+SBwDOzdwnDnIXZLUPU9IGhKPZ0lSL3hC0pB4PEuSesETkobE41mS1AuekDQkHs+SpF7whKQh8XiWJPWCJyQNicezJKkXPCFpSDyeJUm94AlJQ+LxLEnqBU9IGhKPZ0lSL3hC0pB4PEuS+nxC+mV83of7YN6OgXDsTlre9b8zSdLIZAQsaUgMWJKkdhmwNAIGLEmSAUsyYEmS5po9WBoBe7AkSe0CTurBwGQf7oMmj4GT/F2RJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJM0z4OHAVvGxXk3rfACwQcnHugXrWrvqMlNsQ97jQRU/+3qzridj+cVVtiNlnVsDbwI+CnwaOBf4DHAc8AbgUVOud3FN+7nWz5vYvj8ADgCOBf4TOAc4CfhbYCdgzZraeVDG5yj1bwpYNWP5RS1/Dw+ceWdI0tgBDwF+y+8cW9N6NwU+CPyMbCuA04BdCtb1DOAEYCVwTwwFf1RiGzYDjgF+k9H+N4BPZTw+B/x6YTsrfvYjcz7zniXX8UbgS3GZ8P2cCDy2ynYk1vVs4KtxXdcCrwUeDawBbAzsDnwhvn5JmX07sf6DJz7jlTHALezLr2Tsi+WJ95wBXDHx+rum+byJ7doZuDiu63RghxAeQmAJYRI4FLgDuB04rGqQTmnvP3KO82eVWH7NuC+/FpcLx9+/AEtKtv+HwJnx30iaC3KO9wsTy106y36QJN33o/zmiR/hEIjWqGvnAJsDt2T84H+04rpCSPjIFNvw9oz2/7JguT9OvLf0PgFWi71CaW6tcMJcNYas48u2nbIdRyXavjwrRMS2Tkm89+UV2nlHYrk3p7z+8ox9sW/Ke0P4W/D+KT72Qg9iCHgL/qYglNwW33dzUdgvaHdRDP9prgc2LLme0PN61QyfP/k9Ju1UsNyy+L5vTNOuJCkh/G815Yf4BXXuJOBtGT/4J1UMC7eUDScTy4bLQJUDVlz2v+J716/Y5hopPTILvhxOoiXXc0ToaanSdmLZ0CuT9IyC92+YCMMvq9DO++Iy4ZLjqrMErPj+hZDygbLbMHG5+zsTvWSrFixzUOL9obdw/6rtJtYVesiuy/i8ZxZtS2I9ocfyVVNuwyFTBqxFcduvnqZdSVIEPCLjcsLH69xJwIPjZZJJN5ftGQKeGXpzpmz/WTMErHBZKdhsinb3IFup3onQ+wK8Zcrv9u5Ee3eWObkDb43v361CWx+Il2EfkfF61YC1BLiram9lGJeXEmoPLLHcBhOXkUPIen6VtifWt3/O935ghcvMpXsRJ5Z9yzQBK7Hsj6ZpV5J0/5P3ZSk/xLfVNfA30dZnM370d61wwjmo7YCV6OXbaop2Q1DIsrLkCW/agLVwuWfBHSWXWzOO0yocM5RY5iPA0TmvVwpYcZkPh/FzZbchLnNSyj7evOSyn0v5N7BplfYT69o+53sPwfGJPQ5YoQfu+9O0K0mKgC8CT8v4MX5hnTsKeGVGOx8rsezq4X/VZU+WDQSs3WcIWFfnXDK6MfTuNRSwzkppr1QvHPAS4DEVA9YWNQescIPCP1fYhiel9MZ+f8pxZAv+qezyKQFreRw8nyZcwlynjwErLj/Vf2QkSff9iD4+9DrEwc0/SPkxPrnOHRVOKMAvUtq5peg2dGDHcJfTDG3PFLBmaHdJPNE+a+JOzaTP5V26myFgLdyBmFR5PSXbyi1DME3AKrPeifeG8guTzp3xPwB3TXlpePt4R+EryPbxvgYsSdIMYg2gey8DAR9K+TEOt6+vVedOjgN30+SO94m3qh8wrwEr/vndOSfbtzcQsBYG5zMxDut5s36uKbZlqoBV8a7B5Hizynep5lzW22fagBX/fHzO975XzjoMWJI0b2Kv1UXhzrxEnak0L6m53V0z2vm3glvWb5qmJ2GWgFXlElnJgLV63OdpwgDrp9YcsA7PaCvcbPCuULx11s/Xo4D14oz1v6uG8XKnzRiwQs/tdzPWHf4Ts3XXAStu48OmaUuSlBDHXf3DRAmEG1J+kD9V546LISOEpdKD6mOxyC/O2G6lgBXLOhwxS5uTASv+/WGxDlaaa9Iuic0QsPIGWhPHtL1t1uKaPQlYoaBtmoMrrGOTrP00S8BKjA9bKFo76bK0S+QtB6yDp21LkvT7g5KfMvFcsiDlgl+WmZKmCuAfM378/zjj/aFg535tBazYY7a8iYAVn9uTbJ+sK2DljEtK60V5T11TJHUUsE7OWP8bK5Z4SHN32dpVWQErPhemKMrywa4CVpxxIRQXNmBJ0iwWLlWlPP+cjB/lP61zj4dgl9HOiRnFOn8y7e3yJQJWuK3/TxKPV8ZpQ2gqYCXGlGV5bY0Ba8M4bU0ZP4s9WqUKoPYsYIW5BdO8rsI6QrDO8qAaAtaqGePiiHc/7tZCwDps4nh/VWIaIwOWJM0iXnJ7T0bw+mnKj/Kn697jE5W2F/x8cnLfUOwxzJFXQ3tZASvc6bVv4hHm/zu/hYC1Vk7wCQPRl9YRsBJFNM+mvC/PGmg7CFhZcx3uXXE9WXd6Lpk1YCUuQ6Zdiif+29u84YD1oYnj/W2J49CAJUmzCHWnkifwideOy7hVff2atyGt5lDwoon3fRx4Qw3tVblEGMLPt5sMWIk58H6VMwn14joCVqL3ZJ847qqMMCh7g1nabDlgZQXI19fUg7VeHQErMb4vFEBNc37ixpO2LhEuiZeJDViSNK1YpfuCnNdDj9HMPQEltmPLjCl6Tp6YFy1MpbNJDe1VHeT+4qYDVokpVf65roA1ER4Pjvu1yMfnKGBNVnCfZgxWqGCe5tdTbE9mwEqUSMnyjg4Gub/XgCVJM4jB4ZCc1xdl3OX22bp3PHBxXu2tWD393Jraqhqwwl2Vz2k6YMX3fDrnZLtHnQFrImjtW9CjFco5PGROAtbfV/l+c+bLTHNtAwFrjZzLmivivJttBqyNgW2maUuSdN8P6SmhBysEl5zHDzPupNqwzp0Y7gzMOAnsmeiVeH1NbXVeaDTnPRtl7HNi2D2mwQrs62QUma31BocWAlYI42mWVVjHH2Ss4/i6A1aiFzdrKp3r4p2RVnKXpL6Lt6F/vsT7XlpXResSwSIU2Jx0ahh/FKfQ2XjoASu+79k5A6xXNhWwEu2/NaPtQ+ckYK2bcSz9a4V1hF6jNK9oImDF9+VNpRO+dwOWJPVdmJYDOLDE+9aO9a8m/XcD2/SZjLvowraeU2M7vQ5Y8b2hFlWWaQqNVpmsOVwSvTyl3b+u2m4XASu2Ee4InVS6QG0YZ5jRg7h+UwErcdNJFgOWJPVdDDOlppsBTs8YG/Lgmrcp1OJJ8+M6e8zqCFjThI2KAesBGePSpg1Yl2ZVx69QDX3vOQpYj0+5O+/6CssvqytgVgxYeVPpdBaw6uq9lKRBi5fjPl/DCXGmiuoZg61vzxjztVFfAlYs2HlVkwEr8f4wbVAdAevmKgEm1kRKWpmsy9T3gBXb+deUNrYquWwYm5j0f9POYlAlYMX3PzFjKp1OAlacm7T2+neSNDjxjrE3VBzTklaj6YIGtu34lHbOrrmNWQPWX7URsHLGwE0TsMKl1utDD8mUUxhVnuS4BwFrrTjNUaXvOPTsToyBC/vuCTNsR6WAlTOVTlcB61Np0zZJkn6/yORlVXsjwpirlB/o0KuxZZ07GHhuSjuvaaGNsiffNWJQuWKKdpcCV0+x3LE1BKyFy2VHlAwm4TMu+GFdvVdx/WFKlpnqVFVoawvgW4k2wuW3NQqWeffEjAIvqOF4qzQDQcZUOtMGrL+eNmDFuylXVLlBQJJGCTgo/rhWqmkEXJjxI31a1clvSwywTtZj+k2dVcRjG2EOtmkD1kJvwCVTVqwPPSMPq7hcuNHgf6cNWDEULlxy+m1eYI3vTU6W/D3gUVXaK9iWUFvt8xn7/0sLdc/qFHtgw92oC45eqJCeMQdnmK2AOG3M0hraPzpe6q10HKdMpVM5YMWgds40ASv+WzwjvvfIqm1L0ijE284vSvy43lhm8tvQc5FxR1bSRXUWJpwoFFlbUdMQbGIhz7Sq8QthIq8m2DcT7z2vQrt7TIzpCXejHRWCU4V1bJM48U/Tg7V5rBh+dVzHhfFOuaXxkthjgFeHnrn4+k1xoPdaNU7q/bGcufcWhMm8TwjjfupoN2Us0X/H3rxL4+cPUxQ9EnherDG2IvZyhX2x+ozthemI/ifx2cI+/UDFdSSn0qkUsIBtw38Ecvb11wqO9zDubMHMMxlIkjoWexy2io9aC5rOs9DrGPfJTHNBhh6pOA7qsBgqTouFXI+MPXTPKrqMNs9ipfJXAu+PY/4+EQusHgg8epWeif8x2GraQfaSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJM0z4OHAVvGxXk3rfACwQcnHugXrWrvqMlNsQ97jQRU/+3qzridj+cVVtiNlnVsDbwI+CnwaOBf4DHAc8AbgUVOud3FN+7nWz5vYvj8ADgCOBf4TOAc4CfhbYCdgzZraeVDG5yj1bwpYNWP5RS1/Dw+ceWdI0tgBDwF+y+8cW9N6NwU+CPyMbCuA04BdCtb1DOAEYCVwTwwFf1RiGzYDjgF+k9H+N4BPZTw+B/x6YTsrfvYjcz7zniXX8UbgS3GZ8P2cCDy2ynYk1vVs4KtxXdcCrwUeDawBbAzsDnwhvn5JmX07sf6DJz7jlTHALezLr2Tsi+WJ95wBXDHx+rum+byJ7doZuDiu63RghxAeQmAJYRI4FLgDuB04rGqQTmnvP3KO82eVWH7NuC+/FpcLx9+/AEtKtv+HwJnx30iaC3KO9wsTy106y36QJN33o/zmiR/hEIjWqGvnAJsDt2T84H+04rpCSPjIFNvw9oz2/7JguT9OvLf0PgFWi71CaW6tcMJcNYas48u2nbIdRyXavjwrRMS2Tkm89+UV2nlHYrk3p7z+8ox9sW/Ke0P4W/D+KT72Qg9iCHgL/qYglNwW33dzUdgvaHdRDP9prgc2LLme0PN61QyfP/k9Ju1UsNyy+L5vTNOuJCkh/G815Yf4BXXuJOBtGT/4J1UMC7eUDScTy4bLQJUDVlz2v+J716/Y5hopPTILvhxOoiXXc0ToaanSdmLZ0CuT9IyC92+YCMMvq9DO++Iy4ZLjqrMErPj+hZDygbLbMHG5+zsTvWSrFixzUOL9obdw/6rtJtYVesiuy/i8ZxZtS2I9ocfyVVNuwyFTBqxFcduvnqZdSVIEPCLjcsLH69xJwIPjZZJJN5ftGQKeGXpzpmz/WTMErHBZKdhsinb3IFup3onQ+wK8Zcrv9u5Ee3eWObkDb43v361CWx+Il2EfkfF61YC1BLiram9lGJeXEmoPLLHcBhOXkUPIen6VtifWt3/O935ghcvMpXsRJ5Z9yzQBK7Hsj6ZpV5J0/5P3ZSk/xLfVNfA30dZnM370d61wwjmo7YCV6OXbaop2Q1DIsrLkCW/agLVwuWfBHSWXWzOO0yocM5RY5iPA0TmvVwpYcZkPh/FzZbchLnNSyj7evOSyn0v5N7BplfYT69o+53sPwfGJPQ5YoQfu+9O0K0mKgC8CT8v4MX5hnTsKeGVGOx8rsezq4X/VZU+WDQSs3WcIWFfnXDK6MfTuNRSwzkppr1QvHPAS4DEVA9YWNQescIPCP1fYhiel9MZ+f8pxZAv+qezyKQFreRw8nyZcwlynjwErLj/Vf2QkSff9iD4+9DrEwc0/SPkxPrnOHRVOKMAvUtq5peg2dGDHcJfTDG3PFLBmaHdJPNE+a+JOzaTP5V26myFgLdyBmFR5PSXbyi1DME3AKrPeifeG8guTzp3xPwB3TXlpePt4R+EryPbxvgYsSdIMYg2gey8DAR9K+TEOt6+vVedOjgN30+SO94m3qh8wrwEr/vndOSfbtzcQsBYG5zMxDut5s36uKbZlqoBV8a7B5Hizynep5lzW22fagBX/fHzO975XzjoMWJI0b2Kv1UXhzrxEnak0L6m53V0z2vm3glvWb5qmJ2GWgFXlElnJgLV63OdpwgDrp9YcsA7PaCvcbPCuULx11s/Xo4D14oz1v6uG8XKnzRiwQs/tdzPWHf4Ts3XXAStu48OmaUuSlBDHXf3DRAmEG1J+kD9V546LISOEpdKD6mOxyC/O2G6lgBXLOhwxS5uTASv+/WGxDlaaa9Iuic0QsPIGWhPHtL1t1uKaPQlYoaBtmoMrrGOTrP00S8BKjA9bKFo76bK0S+QtB6yDp21LkvT7g5KfMvFcsiDlgl+WmZKmCuAfM378/zjj/aFg535tBazYY7a8iYAVn9uTbJ+sK2DljEtK60V5T11TJHUUsE7OWP8bK5Z4SHN32dpVWQErPhemKMrywa4CVpxxIRQXNmBJ0iwWLlWlPP+cjB/lP61zj4dgl9HOiRnFOn8y7e3yJQJWuK3/TxKPV8ZpQ2gqYCXGlGV5bY0Ba8M4bU0ZP4s9WqUKoPYsYIW5BdO8rsI6QrDO8qAaAtaqGePiiHc/7tZCwDps4nh/VWIaIwOWJM0iXnJ7T0bw+mnKj/Kn697jE5W2F/x8cnLfUOwxzJFXQ3tZASvc6bVv4hHm/zu/hYC1Vk7wCQPRl9YRsBJFNM+mvC/PGmg7CFhZcx3uXXE9WXd6Lpk1YCUuQ6Zdiif+29u84YD1oYnj/W2J49CAJUmzCHWnkifwideOy7hVff2atyGt5lDwoon3fRx4Qw3tVblEGMLPt5sMWIk58H6VMwn14joCVqL3ZJ847qqMMCh7g1nabDlgZQXI19fUg7VeHQErMb4vFEBNc37ixpO2LhEuiZeJDViSNK1YpfuCnNdDj9HMPQEltmPLjCl6Tp6YFy1MpbNJDe1VHeT+4qYDVokpVf65roA1ER4Pjvu1yMfnKGBNVnCfZgxWqGCe5tdTbE9mwEqUSMnyjg4Gub/XgCVJM4jB4ZCc1xdl3OX22bp3PHBxXu2tWD393Jraqhqwwl2Vz2k6YMX3fDrnZLtHnQFrImjtW9CjFco5PGROAtbfV/l+c+bLTHNtAwFrjZzLmivivJttBqyNgW2maUuSdN8P6SmhBysEl5zHDzPupNqwzp0Y7gzMOAnsmeiVeH1NbXVeaDTnPRtl7HNi2D2mwQrs62QUma31BocWAlYI42mWVVjHH2Ss4/i6A1aiFzdrKp3r4p2RVnKXpL6Lt6F/vsT7XlpXResSwSIU2Jx0ahh/FKfQ2XjoASu+79k5A6xXNhWwEu2/NaPtQ+ckYK2bcSz9a4V1hF6jNK9oImDF9+VNpRO+dwOWJPVdmJYDOLDE+9aO9a8m/XcD2/SZjLvowraeU2M7vQ5Y8b2hFlWWaQqNVpmsOVwSvTyl3b+u2m4XASu2Ee4InVS6QG0YZ5jRg7h+UwErcdNJFgOWJPVdDDOlppsBTs8YG/Lgmrcp1OJJ8+M6e8zqCFjThI2KAesBGePSpg1Yl2ZVx69QDX3vOQpYj0+5O+/6CssvqytgVgxYeVPpdBaw6uq9lKRBi5fjPl/DCXGmiuoZg61vzxjztVFfAlYs2HlVkwEr8f4wbVAdAevmKgEm1kRKWpmsy9T3gBXb+deUNrYquWwYm5j0f9POYlAlYMX3PzFjKp1OAlacm7T2+neSNDjxjrE3VBzTklaj6YIGtu34lHbOrrmNWQPWX7URsHLGwE0TsMKl1utDD8mUUxhVnuS4BwFrrTjNUaXvOPTsToyBC/vuCTNsR6WAlTOVTlcB61Np0zZJkn6/yORlVXsjwpirlB/o0KuxZZ07GHhuSjuvaaGNsiffNWJQuWKKdpcCV0+x3LE1BKyFy2VHlAwm4TMu+GFdvVdx/WFKlpnqVFVoawvgW4k2wuW3NQqWeffEjAIvqOF4qzQDQcZUOtMGrL+eNmDFuylXVLlBQJJGCTgo/rhWqmkEXJjxI31a1clvSwywTtZj+k2dVcRjG2EOtmkD1kJvwCVTVqwPPSMPq7hcuNHgf6cNWDEULlxy+m1eYI3vTU6W/D3gUVXaK9iWUFvt8xn7/0sLdc/qFHtgw92oC45eqJCeMQdnmK2AOG3M0hraPzpe6q10HKdMpVM5YMWgds40ASv+WzwjvvfIqm1L0ijE284vSvy43lhm8tvQc5FxR1bSRXUWJpwoFFlbUdMQbGIhz7Sq8QthIq8m2DcT7z2vQrt7TIzpCXejHRWCU4V1bJM48U/Tg7V5rBh+dVzHhfFOuaXxkthjgFeHnrn4+k1xoPdaNU7q/bGcufcWhMm8TwjjfupoN2Us0X/H3rxL4+cPUxQ9EnherDG2IvZyhX2x+ozthemI/ifx2cI+/UDFdSSn0qkUsIBtw38Ecvb11wqO9zDubMHMMxlIkjoWexy2io9aC5rOs9DrGPfJTHNBhh6pOA7qsBgqTouFXI+MPXTPKrqMNs9ipfJXAu+PY/4+EQusHgg8epWeif8x2GraQfaSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmKgM2Ag4G/B14OvAhYBmxbtJOAhwHvAw6P6/gj4CBgX2CTKjsZeACwN3AI8BLgzcDbgHVLLv/UuB3h8V7gMYnX1gHeGNZbsI4NgHfGdRwGvBj4C+BPgPWqfB5JkjRSwG7ALcC/A6snnn8a8NWS6zid+5wd/742cAlwF7B7yXU8ELgQuBhYLfH8ycBVIciVXM684racmvLaXsCmJdbxd3EdN8S/LwYuAH4KPKHMdkiSNErArsBZA3ocMMU+eDTwC+BuYPOU199Zcj0nJQNWfO7A+Ny3S67j3+L7Xz/x/HPj8xeVXM9X4vuPT3ltT2D9EutYlgxY8bk/i88tL7MdE+s7oAfHR52PXavuA0nSSBiw7t0Hx8XQcGnGPlpzhoD1mvjcjSUvM66M73/mxGsP4Xee0WHAWgh6vwUWFa1jYn0GLEmSxgK4PoaGE2dcT1rAOiY+d2CJ5f88EaKWTry2KPHaOzoMWLvH524qWl6SJI0UsCqwIoaGIxPPbwxslXgsqRCwvhoHhX8UuK3spSTg7YkQtWXK6ysnt7ODgHVEfG6/Mp9JkiSNFHBrDA3HJp5bN94VuGDXKj1YwFrAj+Pfd6hwCW3BIydeWy3x2hEtB6xb492D+wGfBJ5X5vNIkqQRCwPHY5D4zMTz2ydCzcZVLxECh8a/n19yO3ZItPekidfWS7z2yhLrOi++96SU10IJinWm6cGSJEkqJdacIvY4rVZjwFofuD0+9+yS9a++H9//4onX/jA+f0uZOlTx8mTqXYfA/kXLx/cZsCRJ0kzjsM6MgeTldQWsiVpSXyy5LTvFchEfmXj+LcA9oUxCyfVsF+/0W5m8IxF4RCiEWjFgFd4BKUmSlNV79G7gmnAJLhTijFXYfw4cVVSqIQxKB76zcEkt9DjF58N6fhWf/6sQ5op2f+jtAr4eL+VtEsY8xYHzL6zy1cWaVbfEwPZF4NxYkmJxiWU3jkVFiSFtryptS5IkTZZDeBzwnFiAtFQNrCYAj4o9Wo8tE8wy1rEG8BRgR2CL+rdSkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkrTK3Ph/BKZ6YCD7yCYAAAAASUVORK5CYII=";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fmtCurrency = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const dt = new Date(d.includes("T") ? d : d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

// ── Cover sheet (multi-page) ────────────────────────────────────────────────────

async function generateCoverSheet(
  doc: PDFDocument,
  draw: Record<string, unknown>,
  lineItems: Record<string, unknown>[],
  job: Record<string, unknown>,
  businessName: string,
  businessAddress: string,
  coverNotes: string | null,
  logoBytes: Uint8Array | null,
): Promise<void> {
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin    = 50;
  const W         = 512;
  const navy      = rgb(0.102, 0.145, 0.251);
  const gold      = rgb(0.788, 0.659, 0.298);
  const dark      = rgb(0.04,  0.12,  0.27);
  const gray      = rgb(0.6,   0.6,   0.6);
  const lgray     = rgb(0.88,  0.88,  0.88);
  const black     = rgb(0,     0,     0);
  const cream     = rgb(0.961, 0.949, 0.910);
  const descColW  = W * 0.65;
  const amtX      = margin + descColW;

  // Embed logo once; reuse across pages
  let logoImg: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (logoBytes) {
    try { logoImg = await doc.embedPng(logoBytes); } catch { /* skip logo on error */ }
  }

  // Space needed on the last page for the total box + footer
  const retainage   = Number(draw.retainage_held ?? 0);
  const totLineCount = retainage > 0 ? 3 : 2;
  const totBoxH     = totLineCount * 18 + 12;
  const MIN_BOTTOM  = margin + 30 /* footer */ + totBoxH + 50 /* dividers + breathing room */;

  // ── Page factory ──────────────────────────────────────────────────────────────
  const addPage = (isFirst: boolean): [ReturnType<typeof doc.addPage>, number] => {
    const pg = doc.addPage([612, 792]);
    pg.drawRectangle({ x: 0, y: 722, width: 612, height: 70, color: navy });

    if (isFirst && logoImg) {
      const scaled = logoImg.scaleToFit(180, 46);
      pg.drawImage(logoImg, {
        x: margin,
        y: 722 + (70 - scaled.height) / 2,
        width: scaled.width, height: scaled.height,
      });
    } else {
      const nameLabel = isFirst ? businessName : `${businessName}  (continued)`;
      pg.drawText(nameLabel, { x: margin, y: 766, size: isFirst ? 18 : 11, font: bold, color: gold });
    }

    const drawLabel  = isFirst ? "DRAW REQUEST" : "DRAW REQUEST";
    const drawLabelW = bold.widthOfTextAtSize(drawLabel, isFirst ? 16 : 11);
    pg.drawText(drawLabel, { x: margin + W - drawLabelW, y: 766, size: isFirst ? 16 : 11, font: bold, color: gold });

    const addrText  = businessAddress || "Kansas City, MO";
    pg.drawText(addrText, { x: margin, y: 748, size: 9, font: regular, color: gold, opacity: 0.75 });
    const drawMeta  = `Draw #${draw.draw_number}  ·  ${fmtDate(draw.created_at as string)}`;
    const drawMetaW = regular.widthOfTextAtSize(drawMeta, 9);
    pg.drawText(drawMeta, { x: margin + W - drawMetaW, y: 748, size: 9, font: regular, color: gold, opacity: 0.75 });

    let y = 704;
    if (isFirst) {
      pg.drawText("Submitted To:", { x: margin,         y, size: 8, font: bold,    color: gray });
      pg.drawText("Project:",      { x: margin + W / 2, y, size: 8, font: bold,    color: gray });
      y -= 14;
      pg.drawText(String(job.client_name ?? ""), { x: margin,         y, size: 12, font: bold,    color: dark });
      pg.drawText(String(job.address    ?? ""), { x: margin + W / 2, y, size: 11, font: regular, color: dark });
      y -= 14;
      if (draw.title) {
        pg.drawText(String(draw.title), { x: margin + W / 2, y, size: 9, font: regular, color: gray });
      }
      y -= 10;
    }

    pg.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 1, color: lgray });
    y -= 14;
    pg.drawText("Description", { x: margin, y, size: 8, font: bold, color: gray });
    pg.drawText("Amount",      { x: amtX,   y, size: 8, font: bold, color: gray });
    y -= 6;
    pg.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 0.5, color: lgray });
    y -= 12;

    return [pg, y];
  };

  const drawFooter = (pg: ReturnType<typeof doc.addPage>) => {
    const footerText = `${businessName}  ·  avenstonekc.com  ·  Kansas City, MO`;
    const ftW = regular.widthOfTextAtSize(footerText, 8);
    pg.drawLine({ start: { x: margin, y: margin + 22 }, end: { x: margin + W, y: margin + 22 }, thickness: 0.5, color: lgray });
    pg.drawText(footerText, { x: margin + W / 2 - ftW / 2, y: margin + 8, size: 8, font: regular, color: gray });
  };

  // ── Item loop — flows across pages ────────────────────────────────────────────
  let [page, y] = addPage(true);

  for (const li of lineItems) {
    if (y < MIN_BOTTOM) {
      drawFooter(page);
      [page, y] = addPage(false);
    }

    const desc     = String(li.description ?? "");
    const amt      = Number(li.total_with_markup ?? 0);
    const maxDescW = descColW - 8;

    let disp = desc;
    while (disp.length > 4 && regular.widthOfTextAtSize(disp, 8.5) > maxDescW) {
      disp = disp.slice(0, -1);
    }
    if (disp !== desc) disp += "…";

    page.drawText(disp, { x: margin, y, size: 8.5, font: regular, color: black });
    const amtStr = fmtCurrency(amt);
    const amtW   = regular.widthOfTextAtSize(amtStr, 8.5);
    page.drawText(amtStr, { x: margin + W - amtW, y, size: 8.5, font: regular, color: black });
    y -= 13;
  }

  // ── Total box (always on the final page) ──────────────────────────────────────
  y -= 4;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 0.5, color: lgray });
  y -= 8;

  const workBilled = lineItems.reduce((s, li) => s + Number(li.total_with_markup ?? 0), 0);
  const netDraw    = workBilled - retainage;
  const totBoxY    = y - totBoxH;
  page.drawRectangle({ x: margin, y: totBoxY, width: W, height: totBoxH, color: cream });

  const totLabelX = margin + W * 0.52;
  let ty = y - 14;

  const drawTot = (label: string, amount: number, sz: number, f: typeof bold, col: typeof black) => {
    page.drawText(label, { x: totLabelX, y: ty, size: sz, font: f, color: col });
    const valStr = fmtCurrency(amount);
    const valW   = f.widthOfTextAtSize(valStr, sz);
    page.drawText(valStr, { x: margin + W - valW, y: ty, size: sz, font: f, color: col });
    ty -= sz + 7;
  };

  drawTot("Work Billed:", workBilled, 9, regular, dark);
  if (retainage > 0) drawTot("Less Retainage Held:", retainage, 9, regular, gray);
  ty -= 2;
  page.drawLine({ start: { x: totLabelX - 4, y: ty + 4 }, end: { x: margin + W, y: ty + 4 }, thickness: 0.5, color: lgray });
  ty -= 4;
  drawTot("NET DRAW REQUEST:", netDraw, 11, bold, navy);

  y = totBoxY - 14;

  if (coverNotes && y > margin + 50) {
    page.drawText("Notes:", { x: margin, y, size: 9, font: bold, color: gray });
    y -= 13;
    for (const line of coverNotes.split("\n").slice(0, 5)) {
      if (y < margin + 40) break;
      page.drawText(line.slice(0, 85), { x: margin, y, size: 8.5, font: regular, color: dark });
      y -= 12;
    }
  }

  drawFooter(page);
}

// ── File helpers ───────────────────────────────────────────────────────────────

interface FileRef {
  id: string;
  source: "job_file" | "company_file";
  amount?: number;
  date?: string;
}

interface FileDetail {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  mime_type: string;
  storage_path: string;
  storage_bucket: string;
  source: "job_file" | "company_file";
  amount?: number;
  date?: string;
}

async function loadFileDetails(sb: ReturnType<typeof createClient>, fileRefs: FileRef[]): Promise<FileDetail[]> {
  const jobIds  = fileRefs.filter(f => f.source === "job_file").map(f => f.id);
  const compIds = fileRefs.filter(f => f.source === "company_file").map(f => f.id);
  const details: FileDetail[] = [];

  if (jobIds.length > 0) {
    const { data } = await sb.from("job_files")
      .select("id, name, category, subcategory, mime_type, storage_path, storage_bucket")
      .in("id", jobIds);
    for (const f of (data || []) as Record<string, unknown>[]) {
      details.push({
        id: f.id as string, name: (f.name as string) || "",
        category: (f.category as string) || "", subcategory: f.subcategory as string | null,
        mime_type: (f.mime_type as string) || "", storage_path: f.storage_path as string,
        storage_bucket: (f.storage_bucket as string) || "job-files", source: "job_file",
      });
    }
  }

  if (compIds.length > 0) {
    const { data } = await sb.from("company_files")
      .select("id, name, category, type, mime_type, storage_path, storage_bucket")
      .in("id", compIds);
    for (const f of (data || []) as Record<string, unknown>[]) {
      details.push({
        id: f.id as string, name: (f.name as string) || "",
        category: (f.category as string) || "", subcategory: (f.type as string) || null,
        mime_type: (f.mime_type as string) || "", storage_path: f.storage_path as string,
        storage_bucket: (f.storage_bucket as string) || "company-files", source: "company_file",
      });
    }
  }

  const orderMap = new Map(fileRefs.map((f, i) => [`${f.source}:${f.id}`, i]));
  return details.sort((a, b) =>
    (orderMap.get(`${a.source}:${a.id}`) ?? 999) - (orderMap.get(`${b.source}:${b.id}`) ?? 999)
  );
}

// quality 90 + resize:contain prevents imgproxy center-crop on non-square images
async function fetchBytes(
  sb: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  isImage = false,
): Promise<Uint8Array | null> {
  try {
    const opts = isImage
      ? { transform: { width: 1200, quality: 90, resize: "contain" as const } }
      : undefined;
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 120, opts);
    if (error || !data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

// Try JPEG first (handles HEIC→JPEG from imgproxy), fall back to PNG
async function embedImage(doc: PDFDocument, bytes: Uint8Array, preferPng: boolean) {
  if (preferPng) {
    try { return await doc.embedPng(bytes); } catch { /* fall through */ }
    try { return await doc.embedJpg(bytes); } catch { return null; }
  } else {
    try { return await doc.embedJpg(bytes); } catch { /* fall through */ }
    try { return await doc.embedPng(bytes); } catch { return null; }
  }
}

// ── Photo grid pages ───────────────────────────────────────────────────────────

const PROOF_ORDER = ["Before", "During", "Install", "Delivery", "After", "CO Condition", "CO Fix", "Other"];

async function addPhotoPages(
  doc: PDFDocument,
  photos: FileDetail[],
  sb: ReturnType<typeof createClient>,
): Promise<void> {
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);

  const navy  = rgb(0.102, 0.145, 0.251);
  const gray  = rgb(0.6,   0.6,   0.6);
  const lgray = rgb(0.88,  0.88,  0.88);

  const margin  = 50;
  const W       = 512;
  const CELL_W  = (W - 8) / 2;
  const IMG_H   = 290;
  const CAP_H   = 18;
  const ROW_H   = IMG_H + CAP_H;
  const ROW_GAP = 8;

  const groups: Record<string, FileDetail[]> = {};
  for (const p of photos) {
    const key = p.subcategory || "Other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ai = PROOF_ORDER.indexOf(a); const bi = PROOF_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const key of sortedKeys) {
    const groupPhotos = groups[key];
    for (let i = 0; i < groupPhotos.length; i += 4) {
      const chunk = groupPhotos.slice(i, i + 4);
      const page  = doc.addPage([612, 792]);

      const headerLabel = i === 0
        ? `${key.toUpperCase()} PHOTOS  (${groupPhotos.length})`
        : `${key.toUpperCase()} PHOTOS  (continued)`;
      page.drawText(headerLabel, { x: margin, y: 762, size: 11, font: bold, color: navy });
      page.drawLine({ start: { x: margin, y: 748 }, end: { x: margin + W, y: 748 }, thickness: 0.5, color: lgray });

      const gridTop = 738;

      const chunkBytes = await Promise.all(
        chunk.map(f => fetchBytes(sb, f.storage_bucket, f.storage_path, true))
      );

      for (let j = 0; j < chunk.length; j++) {
        const col     = j % 2;
        const row     = Math.floor(j / 2);
        const cellX   = margin + col * (CELL_W + 8);
        const imgTopY = gridTop - row * (ROW_H + ROW_GAP);
        const imgBotY = imgTopY - IMG_H;

        const bytes = chunkBytes[j];
        if (bytes && bytes.length > 0) {
          const isMime = (chunk[j].mime_type || "").toLowerCase();
          const img = await embedImage(doc, bytes, isMime.includes("png"));
          if (img) {
            const scaled = img.scaleToFit(CELL_W, IMG_H);
            page.drawImage(img, {
              x: cellX + (CELL_W - scaled.width) / 2,
              y: imgBotY + (IMG_H - scaled.height) / 2,
              width: scaled.width, height: scaled.height,
            });
          } else {
            page.drawRectangle({ x: cellX, y: imgBotY, width: CELL_W, height: IMG_H, color: rgb(0.95, 0.95, 0.95) });
            page.drawText("(unavailable)", { x: cellX + CELL_W / 2 - 28, y: imgBotY + IMG_H / 2, size: 8, font: regular, color: gray });
          }
        } else {
          page.drawRectangle({ x: cellX, y: imgBotY, width: CELL_W, height: IMG_H, color: rgb(0.95, 0.95, 0.95) });
          page.drawText("(unavailable)", { x: cellX + CELL_W / 2 - 28, y: imgBotY + IMG_H / 2, size: 8, font: regular, color: gray });
        }

        const caption = (chunk[j].name || "").slice(0, 42);
        page.drawText(caption, { x: cellX, y: imgBotY - 12, size: 7, font: regular, color: gray });
      }
    }
  }
}

// ── Document pages ─────────────────────────────────────────────────────────────

async function addDocumentPages(
  doc: PDFDocument,
  documents: FileDetail[],
  sb: ReturnType<typeof createClient>,
): Promise<void> {
  const margin = 50;
  const W      = 512;

  const BATCH = 6;
  const allBytes: (Uint8Array | null)[] = [];
  for (let i = 0; i < documents.length; i += BATCH) {
    const batch = documents.slice(i, i + BATCH);
    const mime  = batch.map(f => (f.mime_type || "").toLowerCase());
    const fetched = await Promise.all(
      batch.map((f, bi) => {
        const isImg = mime[bi].includes("jpeg") || mime[bi].includes("jpg") ||
                      mime[bi].includes("png")  || mime[bi].includes("heic") || mime[bi].includes("heif");
        return fetchBytes(sb, f.storage_bucket, f.storage_path, isImg);
      })
    );
    allBytes.push(...fetched);
  }

  for (let idx = 0; idx < documents.length; idx++) {
    const file  = documents[idx];
    const bytes = allBytes[idx];
    if (!bytes || bytes.length === 0) continue;

    const mime = (file.mime_type || "").toLowerCase();

    try {
      if (file.mime_type === "application/pdf") {
        const extDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const indices = extDoc.getPageIndices();
        const copied  = await doc.copyPages(extDoc, indices);
        for (const pg of copied) doc.addPage(pg);

      } else if (mime.includes("jpeg") || mime.includes("jpg") || mime.includes("png") ||
                 mime.includes("heic") || mime.includes("heif")) {
        // Use try-JPEG→PNG fallback; handles HEIC bytes returned as JPEG from imgproxy transform
        const img = await embedImage(doc, bytes, mime.includes("png"));
        if (!img) {
          console.warn(`[build-draw-package] could not embed image ${file.id} (${mime})`);
          continue;
        }

        const page     = doc.addPage([612, 792]);
        const hFont    = await doc.embedFont(StandardFonts.Helvetica);
        const hBold    = await doc.embedFont(StandardFonts.HelveticaBold);
        const navy     = rgb(0.102, 0.145, 0.251);
        const gold     = rgb(0.788, 0.659, 0.298);
        const white    = rgb(1, 1, 1);
        const HEADER_H = 36;
        const headerY  = 792 - HEADER_H;

        page.drawRectangle({ x: 0, y: headerY, width: 612, height: HEADER_H, color: navy });

        const label = (file.name || "Receipt").slice(0, 55);
        page.drawText(label, { x: margin, y: headerY + 13, size: 10, font: hBold, color: white });

        const metaParts: string[] = [];
        if (file.date) {
          const d = new Date(file.date + "T00:00:00");
          metaParts.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
        }
        if (file.amount != null) metaParts.push(fmtCurrency(file.amount));
        if (metaParts.length > 0) {
          const metaStr = metaParts.join("  ·  ");
          const metaW   = hFont.widthOfTextAtSize(metaStr, 9);
          page.drawText(metaStr, { x: margin + W - metaW, y: headerY + 14, size: 9, font: hFont, color: gold });
        }

        const imgAreaH = headerY - margin;
        const scaled   = img.scaleToFit(W, imgAreaH);
        page.drawImage(img, {
          x: margin + (W - scaled.width) / 2,
          y: margin + (imgAreaH - scaled.height) / 2,
          width: scaled.width, height: scaled.height,
        });
      }
      // Other formats (WebP etc): skip silently
    } catch (e) {
      console.warn(`[build-draw-package] skipping file ${file.id} (${mime}):`, (e as Error).message);
    }
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "Unauthenticated" }, 401);

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return json({ ok: false, error: "Unauthenticated" }, 401);

    const body = await req.json();
    const { draw_id, job_id, cover_notes = null, file_refs = [] } = body as {
      draw_id: string; job_id: string; cover_notes?: string | null; file_refs?: FileRef[];
    };
    if (!draw_id || !job_id) return json({ ok: false, error: "draw_id and job_id required" }, 400);

    const { data: draw, error: drawErr } = await sb
      .from("draw_schedules")
      .select("id, draw_number, title, target_amount, retainage_held, created_at")
      .eq("id", draw_id)
      .single();
    if (drawErr || !draw) return json({ ok: false, error: "Draw not found" }, 404);

    const { data: lineItems } = await sb
      .from("draw_line_items")
      .select("description, base_amount, markup_pct, markup_amount, total_with_markup, display_order")
      .eq("draw_id", draw_id)
      .order("display_order", { ascending: true });

    const { data: job, error: jobErr } = await sb
      .from("jobs")
      .select("id, address, client_name, tenant_id")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) return json({ ok: false, error: "Job not found" }, 404);

    const { data: tenant } = await sb
      .from("tenants")
      .select("name, business_address")
      .eq("id", job.tenant_id as string)
      .single();
    const businessName    = (tenant?.name             as string) || "Avenstone Group";
    const businessAddress = (tenant?.business_address as string) || "Kansas City, MO";

    const { data: existingPkg } = await sb
      .from("draw_packages")
      .select("id")
      .eq("draw_id", draw_id)
      .eq("job_id", job_id)
      .maybeSingle();

    let pkgId: string;
    if (existingPkg?.id) {
      pkgId = existingPkg.id as string;
    } else {
      const { data: newPkg, error: pkgErr } = await sb
        .from("draw_packages")
        .insert({ tenant_id: job.tenant_id, job_id, draw_id, status: "draft", created_by_id: user.id })
        .select("id")
        .single();
      if (pkgErr || !newPkg) return json({ ok: false, error: `draw_packages insert failed: ${pkgErr?.message}` }, 500);
      pkgId = newPkg.id as string;
    }

    // Decode embedded logo
    let logoBytes: Uint8Array | null = null;
    try {
      logoBytes = Uint8Array.from(atob(LOGO_PNG_B64), c => c.charCodeAt(0));
    } catch { /* proceed without logo */ }

    let step = "pdf-init";
    const doc = await PDFDocument.create();

    step = "cover-sheet";
    await generateCoverSheet(
      doc,
      draw as Record<string, unknown>,
      (lineItems || []) as Record<string, unknown>[],
      job as Record<string, unknown>,
      businessName,
      businessAddress,
      cover_notes as string | null,
      logoBytes,
    );

    step = "load-file-details";
    if (Array.isArray(file_refs) && file_refs.length > 0) {
      const refMeta = new Map(file_refs.map(r => [`${r.source}:${r.id}`, r]));
      const fileDetails = (await loadFileDetails(sb, file_refs)).map(d => {
        const ref = refMeta.get(`${d.source}:${d.id}`);
        return ref ? { ...d, amount: ref.amount, date: ref.date } : d;
      });
      const photos    = fileDetails.filter(f => f.category === "Photos");
      const documents = fileDetails.filter(f => f.category !== "Photos");

      step = "photo-pages";
      if (photos.length > 0) await addPhotoPages(doc, photos, sb);
      step = "document-pages";
      if (documents.length > 0) await addDocumentPages(doc, documents, sb);
    }

    step = "pdf-save";
    const pdfBytes = await doc.save();

    step = "pdf-upload";
    const pdfPath = `${job_id}/${draw_id}/cover.pdf`;
    const { error: uploadErr } = await sb.storage
      .from(BUCKET)
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) return json({ ok: false, error: `PDF upload failed: ${uploadErr.message}` }, 500);

    step = "signed-url";
    const { data: signedData, error: signedErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(pdfPath, 60 * 60 * 24 * 365);
    if (signedErr || !signedData?.signedUrl) return json({ ok: false, error: `Signed URL failed: ${signedErr?.message ?? "no URL"}` }, 500);

    step = "draw-packages-update";
    const now = new Date().toISOString();
    await sb.from("draw_packages").update({
      generated_pdf_path: pdfPath,
      cover_notes:        cover_notes,
      included_file_ids:  file_refs,
      status:             "previewed",
      updated_at:         now,
    }).eq("id", pkgId);

    return json({ ok: true, signed_url: signedData.signedUrl, draw_package_id: pkgId });

  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? "Unexpected error";
    console.error("build-draw-package error:", msg, err);
    return json({ ok: false, error: msg }, 500);
  }
});
